-- Corrige o escopo da escala de Ceia:
-- configurar o calendário de Ceia NÃO cria escalas nem Push.
-- Escalas só nascem quando a liderança monta a escala de uma data específica.

create or replace function app_private.materialize_communion_agenda(
  p_organization_id uuid,
  p_from date default (current_date-45),
  p_horizon_days integer default 400
)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_to date:=current_date+greatest(30,least(coalesce(p_horizon_days,400),730));
  v_old record;
  v_rule record;
  v_month date;
  v_candidate date;
  v_event_id uuid;
  v_applied integer:=0;
begin
  if p_organization_id is null then
    raise exception 'organization required';
  end if;

  for v_old in
    select
      co.event_id,
      co.organization_id,
      co.routine_id,
      co.original_date,
      coalesce(nullif(se.override_title,''),r.name) as base_title
    from public.communion_occurrences co
    join public.service_routines r
      on r.id=co.routine_id
     and r.organization_id=co.organization_id
    left join public.service_exceptions se
      on se.organization_id=co.organization_id
     and se.routine_id=co.routine_id
     and se.original_date=co.original_date
    where co.organization_id=p_organization_id
      and co.original_date between p_from and v_to
  loop
    update public.events
    set title=v_old.base_title,
        updated_at=now()
    where id=v_old.event_id
      and organization_id=p_organization_id;
  end loop;

  delete from public.communion_occurrences
  where organization_id=p_organization_id
    and original_date between p_from and v_to;

  for v_rule in
    select cr.*,r.weekday,r.start_time,r.name as routine_name
    from public.communion_rules cr
    join public.service_routines r
      on r.id=cr.target_routine_id
     and r.organization_id=cr.organization_id
     and r.unit_id=cr.unit_id
    where cr.organization_id=p_organization_id
      and cr.active=true
      and r.active=true
  loop
    perform app_private.ensure_communion_department(
      p_organization_id,
      v_rule.unit_id
    );

    if v_rule.frequency='monthly' then
      for v_month in
        select g::date
        from generate_series(
          date_trunc('month',p_from)::date::timestamp,
          date_trunc('month',v_to)::date::timestamp,
          interval '1 month'
        ) g
      loop
        v_candidate:=app_private.nth_weekday_of_month(
          extract(year from v_month)::integer,
          extract(month from v_month)::integer,
          v_rule.weekday,
          v_rule.ordinal
        );

        if v_candidate is null
           or v_candidate<p_from
           or v_candidate>v_to then
          continue;
        end if;

        select so.event_id into v_event_id
        from public.service_occurrences so
        join public.events e
          on e.id=so.event_id
         and e.organization_id=so.organization_id
        where so.organization_id=p_organization_id
          and so.routine_id=v_rule.target_routine_id
          and so.original_date=v_candidate
          and so.is_current=true
          and e.status='published'
        limit 1;

        if v_event_id is null then
          continue;
        end if;

        update public.events
        set title=v_rule.title,
            updated_at=now()
        where id=v_event_id
          and organization_id=p_organization_id;

        insert into public.communion_occurrences(
          event_id,organization_id,unit_id,rule_id,routine_id,original_date
        )
        values(
          v_event_id,p_organization_id,v_rule.unit_id,v_rule.id,
          v_rule.target_routine_id,v_candidate
        )
        on conflict(event_id) do update
        set rule_id=excluded.rule_id,
            original_date=excluded.original_date;

        v_applied:=v_applied+1;
        v_event_id:=null;
      end loop;
    else
      for v_month in
        select make_date(y,v_rule.month_of_year,1)
        from generate_series(
          extract(year from p_from)::integer,
          extract(year from v_to)::integer
        ) y
      loop
        v_candidate:=app_private.nth_weekday_of_month(
          extract(year from v_month)::integer,
          v_rule.month_of_year,
          v_rule.weekday,
          v_rule.ordinal
        );

        if v_candidate is null
           or v_candidate<p_from
           or v_candidate>v_to then
          continue;
        end if;

        select so.event_id into v_event_id
        from public.service_occurrences so
        join public.events e
          on e.id=so.event_id
         and e.organization_id=so.organization_id
        where so.organization_id=p_organization_id
          and so.routine_id=v_rule.target_routine_id
          and so.original_date=v_candidate
          and so.is_current=true
          and e.status='published'
        limit 1;

        if v_event_id is null then
          continue;
        end if;

        update public.events
        set title=v_rule.title,
            updated_at=now()
        where id=v_event_id
          and organization_id=p_organization_id;

        insert into public.communion_occurrences(
          event_id,organization_id,unit_id,rule_id,routine_id,original_date
        )
        values(
          v_event_id,p_organization_id,v_rule.unit_id,v_rule.id,
          v_rule.target_routine_id,v_candidate
        )
        on conflict(event_id) do update
        set rule_id=excluded.rule_id,
            original_date=excluded.original_date;

        v_applied:=v_applied+1;
        v_event_id:=null;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'communion_occurrences',v_applied
  );
end;
$function$;

delete from app_private.schedule_notification_outbox o
where o.processed_at is null
  and exists (
    select 1
    from public.schedule_assignments sa
    join public.schedule_rules sr
      on sr.id=sa.rule_id
     and sr.organization_id=sa.organization_id
    join public.departments d
      on d.id=sr.department_id
     and d.organization_id=sr.organization_id
    where d.system_key='communion'
      and sr.created_by is null
      and sa.id::text=(o.payload->>'assignment_id')
  );

update public.schedule_assignments sa
set status='cancelled',
    updated_at=now()
from public.schedule_rules sr,
     public.departments d
where sr.id=sa.rule_id
  and sr.organization_id=sa.organization_id
  and d.id=sr.department_id
  and d.organization_id=sr.organization_id
  and d.system_key='communion'
  and sr.created_by is null
  and sa.status in ('pending','confirmed','replacement_requested');

update public.schedule_rules sr
set active=false,
    updated_at=now()
from public.departments d
where d.id=sr.department_id
  and d.organization_id=sr.organization_id
  and d.system_key='communion'
  and sr.created_by is null
  and sr.active=true;

notify pgrst,'reload schema';
