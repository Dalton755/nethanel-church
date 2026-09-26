-- ELO v36 — motor de Ceia do Senhor.
-- A Ceia transforma uma ocorrência de um culto recorrente já existente,
-- sem criar culto duplicado. A regra é fácil: culto base + posição no mês.

alter table public.departments
add column if not exists system_key text;

create unique index if not exists departments_system_key_unique
on public.departments(organization_id, unit_id, system_key)
where system_key is not null;

create table if not exists public.communion_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null,
  target_routine_id uuid not null,
  title text not null default 'Ceia do Senhor',
  frequency text not null check (frequency in ('monthly','annual')),
  month_of_year smallint,
  ordinal smallint not null check (ordinal in (-1,1,2,3,4,5)),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (unit_id, organization_id)
    references public.units(id, organization_id) on delete cascade,
  foreign key (target_routine_id, organization_id)
    references public.service_routines(id, organization_id) on delete cascade,
  check (
    (frequency='monthly' and month_of_year is null)
    or
    (frequency='annual' and month_of_year between 1 and 12)
  )
);

create unique index if not exists communion_rules_unique_pattern
on public.communion_rules(
  organization_id, unit_id, target_routine_id,
  frequency, coalesce(month_of_year,0), ordinal
)
where active=true;

create index if not exists communion_rules_lookup_idx
on public.communion_rules(organization_id, unit_id, active, frequency);

alter table public.communion_rules enable row level security;

create table if not exists public.communion_occurrences (
  event_id uuid primary key,
  organization_id uuid not null,
  unit_id uuid not null,
  rule_id uuid not null references public.communion_rules(id) on delete cascade,
  routine_id uuid not null,
  original_date date not null,
  created_at timestamptz not null default now(),
  unique (organization_id, routine_id, original_date),
  foreign key (event_id, organization_id)
    references public.events(id, organization_id) on delete cascade,
  foreign key (unit_id, organization_id)
    references public.units(id, organization_id) on delete cascade,
  foreign key (routine_id, organization_id)
    references public.service_routines(id, organization_id) on delete cascade
);

create index if not exists communion_occurrences_date_idx
on public.communion_occurrences(organization_id, unit_id, original_date);

alter table public.communion_occurrences enable row level security;

drop trigger if exists communion_rules_touch on public.communion_rules;

create trigger communion_rules_touch
before update on public.communion_rules
for each row execute function app_private.elo_touch_updated_at();

create or replace function app_private.nth_weekday_of_month(
  p_year integer,
  p_month integer,
  p_weekday integer,
  p_ordinal integer
)
returns date
language plpgsql
immutable
set search_path='pg_catalog','pg_temp'
as $function$
declare
  v_first date;
  v_last date;
  v_candidate date;
  v_offset integer;
begin
  if p_month not between 1 and 12
     or p_weekday not between 0 and 6
     or p_ordinal not in (-1,1,2,3,4,5) then
    return null;
  end if;

  v_first:=make_date(p_year,p_month,1);
  v_last:=(date_trunc('month',v_first)::date + interval '1 month - 1 day')::date;

  if p_ordinal=-1 then
    v_offset:=(extract(dow from v_last)::integer-p_weekday+7)%7;
    return v_last-v_offset;
  end if;

  v_offset:=(p_weekday-extract(dow from v_first)::integer+7)%7;
  v_candidate:=v_first+v_offset+((p_ordinal-1)*7);

  if extract(month from v_candidate)::integer<>p_month then
    return null;
  end if;

  return v_candidate;
end;
$function$;

create or replace function app_private.ensure_communion_department(
  p_organization_id uuid,
  p_unit_id uuid
)
returns uuid
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_department_id uuid;
  v_name text;
begin
  select id into v_department_id
  from public.departments
  where organization_id=p_organization_id
    and unit_id=p_unit_id
    and system_key='communion'
  limit 1;

  if v_department_id is null then
    insert into public.departments(
      organization_id, unit_id, name, description,
      active, system_key, created_by
    )
    values(
      p_organization_id, p_unit_id, 'Ceia',
      'Equipe especial da Ceia do Senhor.',
      true, 'communion', null
    )
    returning id into v_department_id;
  else
    update public.departments
    set active=true, updated_at=now()
    where id=v_department_id;
  end if;

  foreach v_name in array array[
    'Servir o pão',
    'Servir o vinho',
    'Preparar a ceia'
  ]
  loop
    if not exists (
      select 1
      from public.department_functions f
      where f.organization_id=p_organization_id
        and f.department_id=v_department_id
        and lower(f.name)=lower(v_name)
        and f.active=true
    ) then
      insert into public.department_functions(
        organization_id, department_id, name,
        default_required_count, sort_order, active, created_by
      )
      values(
        p_organization_id,
        v_department_id,
        v_name,
        1,
        case v_name
          when 'Preparar a ceia' then 1
          when 'Servir o pão' then 2
          else 3
        end,
        true,
        null
      );
    end if;
  end loop;

  return v_department_id;
end;
$function$;

create or replace function app_private.ensure_communion_schedule_rules(
  p_organization_id uuid,
  p_unit_id uuid,
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_department_id uuid;
  v_function record;
  v_event public.events%rowtype;
  v_horizon integer;
  v_count integer:=0;
begin
  select * into v_event
  from public.events
  where id=p_event_id
    and organization_id=p_organization_id
    and unit_id=p_unit_id
    and status='published';

  if not found then return 0; end if;

  v_department_id:=app_private.ensure_communion_department(
    p_organization_id, p_unit_id
  );

  v_horizon:=greatest(
    7,
    least(
      180,
      ceil(
        greatest(
          0,
          extract(epoch from (v_event.starts_at-now()))/86400.0
        )
      )::integer+1
    )
  );

  for v_function in
    select *
    from public.department_functions
    where organization_id=p_organization_id
      and department_id=v_department_id
      and active=true
    order by sort_order,name
  loop
    if not exists (
      select 1
      from public.schedule_rules sr
      where sr.organization_id=p_organization_id
        and sr.event_id=p_event_id
        and sr.department_id=v_department_id
        and sr.department_function_id=v_function.id
        and sr.active=true
    ) then
      insert into public.schedule_rules(
        organization_id, department_id, routine_id, event_id,
        department_function_id, role_label, required_count,
        rotation_mode, min_rest_days, horizon_days, active, created_by
      )
      values(
        p_organization_id, v_department_id, null, p_event_id,
        v_function.id, v_function.name, v_function.default_required_count,
        'balanced', 0, v_horizon, true, null
      );

      v_count:=v_count+1;
    end if;
  end loop;

  return v_count;
end;
$function$;

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
      co.unit_id,
      co.rule_id,
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
    set title=v_old.base_title, updated_at=now()
    where id=v_old.event_id
      and organization_id=p_organization_id;

    update public.schedule_rules sr
    set active=false, updated_at=now()
    where sr.organization_id=p_organization_id
      and sr.event_id=v_old.event_id
      and sr.active=true
      and exists (
        select 1
        from public.departments d
        where d.id=sr.department_id
          and d.organization_id=sr.organization_id
          and d.system_key='communion'
      );

    update public.schedule_assignments sa
    set status='cancelled', updated_at=now()
    where sa.organization_id=p_organization_id
      and sa.event_id=v_old.event_id
      and sa.status in ('pending','confirmed','replacement_requested')
      and exists (
        select 1
        from public.departments d
        where d.id=sa.department_id
          and d.organization_id=sa.organization_id
          and d.system_key='communion'
      );
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

        if v_event_id is null then continue; end if;

        update public.events
        set title=v_rule.title, updated_at=now()
        where id=v_event_id
          and organization_id=p_organization_id;

        insert into public.communion_occurrences(
          event_id, organization_id, unit_id, rule_id,
          routine_id, original_date
        )
        values(
          v_event_id, p_organization_id, v_rule.unit_id,
          v_rule.id, v_rule.target_routine_id, v_candidate
        )
        on conflict(event_id) do update
        set rule_id=excluded.rule_id,
            original_date=excluded.original_date;

        v_special_rules:=v_special_rules+
          app_private.ensure_communion_schedule_rules(
            p_organization_id, v_rule.unit_id, v_event_id
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

        if v_event_id is null then continue; end if;

        update public.events
        set title=v_rule.title, updated_at=now()
        where id=v_event_id
          and organization_id=p_organization_id;

        insert into public.communion_occurrences(
          event_id, organization_id, unit_id, rule_id,
          routine_id, original_date
        )
        values(
          v_event_id, p_organization_id, v_rule.unit_id,
          v_rule.id, v_rule.target_routine_id, v_candidate
        )
        on conflict(event_id) do update
        set rule_id=excluded.rule_id,
            original_date=excluded.original_date;

        v_special_rules:=v_special_rules+
          app_private.ensure_communion_schedule_rules(
            p_organization_id, v_rule.unit_id, v_event_id
          );

        v_applied:=v_applied+1;
        v_event_id:=null;
      end loop;
    end if;
  end loop;

  perform app_private.generate_schedules(p_organization_id,60);

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'communion_occurrences',v_applied,
    'special_schedule_rules_created',v_special_rules
  );
end;
$function$;

create or replace function public.list_communion_rules(
  p_organization_id uuid,
  p_unit_id uuid
)
returns table(
  rule_id uuid,
  title text,
  frequency text,
  month_of_year smallint,
  ordinal smallint,
  target_routine_id uuid,
  routine_name text,
  weekday smallint,
  start_time time,
  active boolean
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    cr.id, cr.title, cr.frequency, cr.month_of_year, cr.ordinal,
    cr.target_routine_id, r.name, r.weekday, r.start_time, cr.active
  from public.communion_rules cr
  join public.service_routines r
    on r.id=cr.target_routine_id
   and r.organization_id=cr.organization_id
  where cr.organization_id=p_organization_id
    and cr.unit_id=p_unit_id
    and cr.active=true
    and app_private.has_permission(
      p_organization_id,'services.view',p_unit_id
    )
  order by
    case cr.frequency when 'monthly' then 0 else 1 end,
    coalesce(cr.month_of_year,0),
    cr.ordinal,
    r.start_time;
$function$;

revoke all on function public.list_communion_rules(uuid,uuid)
from public,anon;
grant execute on function public.list_communion_rules(uuid,uuid)
to authenticated;

create or replace function public.save_communion_rule(
  p_organization_id uuid,
  p_unit_id uuid,
  p_rule_id uuid,
  p_title text,
  p_frequency text,
  p_month_of_year integer,
  p_ordinal integer,
  p_target_routine_id uuid
)
returns public.communion_rules
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result public.communion_rules%rowtype;
  v_frequency text:=lower(trim(coalesce(p_frequency,'')));
  v_title text:=trim(coalesce(p_title,''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not (
    app_private.has_permission(p_organization_id,'services.manage',p_unit_id)
    or app_private.has_permission(p_organization_id,'agenda.manage',p_unit_id)
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_frequency not in ('monthly','annual') then
    raise exception 'Invalid communion frequency';
  end if;

  if p_ordinal not in (-1,1,2,3,4,5) then
    raise exception 'Invalid ordinal';
  end if;

  if v_frequency='annual'
     and coalesce(p_month_of_year,0) not between 1 and 12 then
    raise exception 'Month required for annual rule';
  end if;

  if v_title='' then v_title:='Ceia do Senhor'; end if;

  if not exists (
    select 1
    from public.service_routines r
    where r.id=p_target_routine_id
      and r.organization_id=p_organization_id
      and r.unit_id=p_unit_id
      and r.active=true
  ) then
    raise exception 'Recurring service not found';
  end if;

  if p_rule_id is null then
    insert into public.communion_rules(
      organization_id,unit_id,target_routine_id,title,
      frequency,month_of_year,ordinal,active,created_by
    )
    values(
      p_organization_id,p_unit_id,p_target_routine_id,v_title,
      v_frequency,
      case when v_frequency='annual' then p_month_of_year else null end,
      p_ordinal,true,auth.uid()
    )
    returning * into v_result;
  else
    update public.communion_rules
    set target_routine_id=p_target_routine_id,
        title=v_title,
        frequency=v_frequency,
        month_of_year=case
          when v_frequency='annual' then p_month_of_year
          else null
        end,
        ordinal=p_ordinal,
        active=true,
        updated_at=now()
    where id=p_rule_id
      and organization_id=p_organization_id
      and unit_id=p_unit_id
    returning * into v_result;

    if not found then raise exception 'Communion rule not found'; end if;
  end if;

  perform app_private.materialize_service_agenda(
    p_organization_id,current_date-45,400
  );

  perform app_private.materialize_communion_agenda(
    p_organization_id,current_date-45,400
  );

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    'communion.rule_saved','communion_rules',v_result.id,
    jsonb_build_object(
      'frequency',v_frequency,
      'month_of_year',v_result.month_of_year,
      'ordinal',v_result.ordinal,
      'target_routine_id',v_result.target_routine_id
    )
  );

  return v_result;
end;
$function$;

revoke all on function public.save_communion_rule(
  uuid,uuid,uuid,text,text,integer,integer,uuid
) from public,anon;
grant execute on function public.save_communion_rule(
  uuid,uuid,uuid,text,text,integer,integer,uuid
) to authenticated;

create or replace function public.archive_communion_rule(
  p_organization_id uuid,
  p_unit_id uuid,
  p_rule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
begin
  if not (
    app_private.has_permission(p_organization_id,'services.manage',p_unit_id)
    or app_private.has_permission(p_organization_id,'agenda.manage',p_unit_id)
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  update public.communion_rules
  set active=false,updated_at=now()
  where id=p_rule_id
    and organization_id=p_organization_id
    and unit_id=p_unit_id;

  if not found then return false; end if;

  perform app_private.materialize_service_agenda(
    p_organization_id,current_date-45,400
  );

  perform app_private.materialize_communion_agenda(
    p_organization_id,current_date-45,400
  );

  return true;
end;
$function$;

revoke all on function public.archive_communion_rule(uuid,uuid,uuid)
from public,anon;
grant execute on function public.archive_communion_rule(uuid,uuid,uuid)
to authenticated;

create or replace function public.is_communion_event(
  p_organization_id uuid,
  p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select exists (
    select 1
    from public.communion_occurrences co
    where co.organization_id=p_organization_id
      and co.event_id=p_event_id
      and app_private.is_org_member(p_organization_id)
  );
$function$;

revoke all on function public.is_communion_event(uuid,uuid)
from public,anon;
grant execute on function public.is_communion_event(uuid,uuid)
to authenticated;

create or replace function public.refresh_service_agenda(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result jsonb;
  v_communion jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not (
    app_private.has_permission(p_organization_id,'services.manage',null)
    or app_private.has_permission(p_organization_id,'agenda.manage',null)
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  v_result:=app_private.materialize_service_agenda(
    p_organization_id,current_date-45,400
  );

  v_communion:=app_private.materialize_communion_agenda(
    p_organization_id,current_date-45,400
  );

  v_result:=v_result||jsonb_build_object('communion',v_communion);

  perform app_private.write_audit(
    p_organization_id,null,
    'agenda.refreshed','organizations',p_organization_id,v_result
  );

  return v_result;
end;
$function$;

create or replace function app_private.materialize_service_routine_change()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_org uuid:=coalesce(new.organization_id,old.organization_id);
begin
  perform app_private.materialize_service_agenda(v_org,current_date-45,400);
  perform app_private.materialize_communion_agenda(v_org,current_date-45,400);
  return coalesce(new,old);
end;
$function$;

create or replace function app_private.materialize_service_exception_change()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_org uuid:=coalesce(new.organization_id,old.organization_id);
begin
  perform app_private.materialize_service_agenda(v_org,current_date-45,400);
  perform app_private.materialize_communion_agenda(v_org,current_date-45,400);
  return coalesce(new,old);
end;
$function$;

create or replace function app_private.materialize_all_service_agendas()
returns void
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_org record;
begin
  for v_org in select id from public.organizations where status='active'
  loop
    begin
      perform app_private.materialize_service_agenda(v_org.id,current_date-45,400);
      perform app_private.materialize_communion_agenda(v_org.id,current_date-45,400);
    exception when others then
      insert into public.agenda_engine_runs(
        organization_id,last_run_at,window_start,window_end,
        status,last_error,updated_at
      )
      values(
        v_org.id,now(),current_date-45,current_date+400,
        'error',left(sqlerrm,500),now()
      )
      on conflict (organization_id) do update
      set last_run_at=now(),
          window_start=current_date-45,
          window_end=current_date+400,
          status='error',
          last_error=left(sqlerrm,500),
          updated_at=now();
    end;
  end loop;
end;
$function$;

notify pgrst,'reload schema';
