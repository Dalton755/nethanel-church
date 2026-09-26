-- ELO v36c — preserva confirmações de escala ao recalcular Ceia
-- e impede alteração de fechamento financeiro já aprovado.

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
  v_old_event_ids uuid[]:='{}'::uuid[];
  v_applied integer:=0;
  v_special_rules integer:=0;
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
    v_old_event_ids:=array_append(v_old_event_ids,v_old.event_id);

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

        v_special_rules:=v_special_rules+
          app_private.ensure_communion_schedule_rules(
            p_organization_id,v_rule.unit_id,v_event_id
          );

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

        v_special_rules:=v_special_rules+
          app_private.ensure_communion_schedule_rules(
            p_organization_id,v_rule.unit_id,v_event_id
          );

        v_applied:=v_applied+1;
        v_event_id:=null;
      end loop;
    end if;
  end loop;

  if cardinality(v_old_event_ids)>0 then
    update public.schedule_rules sr
    set active=false,
        updated_at=now()
    where sr.organization_id=p_organization_id
      and sr.event_id=any(v_old_event_ids)
      and sr.active=true
      and not exists (
        select 1
        from public.communion_occurrences co
        where co.organization_id=p_organization_id
          and co.event_id=sr.event_id
      )
      and exists (
        select 1
        from public.departments d
        where d.id=sr.department_id
          and d.organization_id=sr.organization_id
          and d.system_key='communion'
      );

    update public.schedule_assignments sa
    set status='cancelled',
        updated_at=now()
    where sa.organization_id=p_organization_id
      and sa.event_id=any(v_old_event_ids)
      and sa.status in ('pending','confirmed','replacement_requested')
      and not exists (
        select 1
        from public.communion_occurrences co
        where co.organization_id=p_organization_id
          and co.event_id=sa.event_id
      )
      and exists (
        select 1
        from public.departments d
        where d.id=sa.department_id
          and d.organization_id=sa.organization_id
          and d.system_key='communion'
      );
  end if;

  perform app_private.generate_schedules(p_organization_id,60);

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'communion_occurrences',v_applied,
    'special_schedule_rules_created',v_special_rules
  );
end;
$function$;

create or replace function public.save_finance_service_closure(
  p_organization_id uuid,
  p_unit_id uuid,
  p_event_id uuid,
  p_cash_amount numeric,
  p_pix_amount numeric,
  p_card_amount numeric,
  p_other_amount numeric,
  p_notes text,
  p_submit boolean default false
)
returns public.finance_service_closures
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result public.finance_service_closures%rowtype;
begin
  if not app_private.has_permission(
    p_organization_id,'finance.manage',null
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.events e
    where e.id=p_event_id
      and e.organization_id=p_organization_id
      and e.unit_id=p_unit_id
      and e.status<>'cancelled'
  ) then
    raise exception 'Service not found';
  end if;

  if exists (
    select 1
    from public.finance_service_closures fc
    where fc.organization_id=p_organization_id
      and fc.event_id=p_event_id
      and fc.status='approved'
  ) then
    raise exception 'Approved closure cannot be changed';
  end if;

  if least(
    coalesce(p_cash_amount,0),
    coalesce(p_pix_amount,0),
    coalesce(p_card_amount,0),
    coalesce(p_other_amount,0)
  )<0 then
    raise exception 'Invalid closure values';
  end if;

  insert into public.finance_service_closures(
    organization_id,unit_id,event_id,status,
    cash_amount,pix_amount,card_amount,other_amount,
    notes,submitted_by,submitted_at,created_by
  )
  values(
    p_organization_id,p_unit_id,p_event_id,
    case when p_submit then 'submitted' else 'draft' end,
    coalesce(p_cash_amount,0),
    coalesce(p_pix_amount,0),
    coalesce(p_card_amount,0),
    coalesce(p_other_amount,0),
    nullif(trim(coalesce(p_notes,'')),''),
    case when p_submit then auth.uid() else null end,
    case when p_submit then now() else null end,
    auth.uid()
  )
  on conflict(organization_id,event_id)
  do update set
    cash_amount=excluded.cash_amount,
    pix_amount=excluded.pix_amount,
    card_amount=excluded.card_amount,
    other_amount=excluded.other_amount,
    notes=excluded.notes,
    status=excluded.status,
    submitted_by=case
      when excluded.status='submitted' then auth.uid()
      else public.finance_service_closures.submitted_by
    end,
    submitted_at=case
      when excluded.status='submitted' then now()
      else public.finance_service_closures.submitted_at
    end,
    updated_at=now()
  returning * into v_result;

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    case when p_submit
      then 'finance.service_closure_submitted'
      else 'finance.service_closure_saved'
    end,
    'finance_service_closures',v_result.id,
    jsonb_build_object(
      'event_id',p_event_id,
      'total_amount',v_result.total_amount,
      'status',v_result.status
    )
  );

  return v_result;
end;
$function$;

notify pgrst,'reload schema';
