-- ELO v35 — funções por departamento + resposta robusta de escala

create table if not exists public.department_functions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null,
  name text not null,
  default_required_count integer not null default 1
    check (default_required_count between 1 and 50),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, department_id, organization_id),
  foreign key (department_id, organization_id)
    references public.departments(id, organization_id)
    on delete cascade
);

create unique index if not exists department_functions_name_unique
on public.department_functions(department_id, lower(name))
where active=true;

create index if not exists department_functions_department_idx
on public.department_functions(organization_id, department_id, active, sort_order);

alter table public.department_functions enable row level security;

create table if not exists public.department_member_functions (
  organization_id uuid not null,
  department_id uuid not null,
  person_id uuid not null,
  function_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (function_id, person_id),
  foreign key (department_id, organization_id)
    references public.departments(id, organization_id)
    on delete cascade,
  foreign key (person_id, organization_id)
    references public.people(id, organization_id)
    on delete cascade,
  foreign key (function_id, department_id, organization_id)
    references public.department_functions(id, department_id, organization_id)
    on delete cascade
);

create index if not exists department_member_functions_person_idx
on public.department_member_functions(
  organization_id, department_id, person_id, active
);

alter table public.department_member_functions enable row level security;

alter table public.schedule_rules
add column if not exists department_function_id uuid;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='schedule_rules_department_function_fk'
      and conrelid='public.schedule_rules'::regclass
  ) then
    alter table public.schedule_rules
    add constraint schedule_rules_department_function_fk
    foreign key (department_function_id, department_id, organization_id)
    references public.department_functions(id, department_id, organization_id)
    on delete set null;
  end if;
end;
$block$;

create index if not exists schedule_rules_department_function_idx
on public.schedule_rules(
  organization_id, event_id, department_id, department_function_id
);

create unique index if not exists schedule_rules_active_function_event_unique
on public.schedule_rules(
  organization_id, event_id, department_id, department_function_id
)
where active=true
  and event_id is not null
  and department_function_id is not null;

drop trigger if exists department_functions_touch
on public.department_functions;

create trigger department_functions_touch
before update on public.department_functions
for each row execute function app_private.elo_touch_updated_at();

create or replace function public.list_department_functions(
  p_organization_id uuid,
  p_department_id uuid
)
returns table(
  function_id uuid,
  function_name text,
  default_required_count integer,
  sort_order integer,
  active boolean,
  qualified_member_count bigint
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    f.id,
    f.name,
    f.default_required_count,
    f.sort_order,
    f.active,
    (
      select count(*)
      from public.department_member_functions dmf
      join public.department_members dm
        on dm.organization_id=dmf.organization_id
       and dm.department_id=dmf.department_id
       and dm.person_id=dmf.person_id
      where dmf.organization_id=f.organization_id
        and dmf.department_id=f.department_id
        and dmf.function_id=f.id
        and dmf.active=true
        and dm.status='active'
        and dm.can_serve=true
    )::bigint
  from public.department_functions f
  where f.organization_id=p_organization_id
    and f.department_id=p_department_id
    and app_private.is_org_member(p_organization_id)
  order by f.active desc,f.sort_order,f.name;
$function$;

revoke all on function public.list_department_functions(uuid,uuid)
from public,anon;
grant execute on function public.list_department_functions(uuid,uuid)
to authenticated;

create or replace function public.save_department_function(
  p_organization_id uuid,
  p_department_id uuid,
  p_function_id uuid,
  p_name text,
  p_default_required_count integer default 1
)
returns public.department_functions
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_department public.departments%rowtype;
  v_result public.department_functions%rowtype;
  v_name text:=trim(coalesce(p_name,''));
  v_count integer:=greatest(1,least(coalesce(p_default_required_count,1),50));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_department
  from public.departments
  where id=p_department_id
    and organization_id=p_organization_id
    and active=true;

  if not found then raise exception 'Department not found'; end if;

  if not app_private.has_permission(
    p_organization_id,'departments.manage',v_department.unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if length(v_name)<2 then raise exception 'Function name required'; end if;

  if p_function_id is null then
    insert into public.department_functions(
      organization_id,department_id,name,default_required_count,
      sort_order,active,created_by
    )
    values(
      p_organization_id,p_department_id,v_name,v_count,
      coalesce((
        select max(sort_order)+1
        from public.department_functions
        where organization_id=p_organization_id
          and department_id=p_department_id
      ),0),
      true,auth.uid()
    )
    returning * into v_result;
  else
    update public.department_functions
    set name=v_name,
        default_required_count=v_count,
        active=true,
        updated_at=now()
    where id=p_function_id
      and organization_id=p_organization_id
      and department_id=p_department_id
    returning * into v_result;

    if not found then raise exception 'Department function not found'; end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.save_department_function(
  uuid,uuid,uuid,text,integer
) from public,anon;
grant execute on function public.save_department_function(
  uuid,uuid,uuid,text,integer
) to authenticated;

create or replace function public.archive_department_function(
  p_organization_id uuid,
  p_department_id uuid,
  p_function_id uuid
)
returns boolean
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id
  from public.departments
  where id=p_department_id
    and organization_id=p_organization_id;

  if v_unit_id is null
     or not app_private.has_permission(
       p_organization_id,'departments.manage',v_unit_id
     ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  update public.department_functions
  set active=false,updated_at=now()
  where id=p_function_id
    and organization_id=p_organization_id
    and department_id=p_department_id;

  update public.department_member_functions
  set active=false
  where function_id=p_function_id
    and organization_id=p_organization_id
    and department_id=p_department_id;

  return found;
end;
$function$;

revoke all on function public.archive_department_function(uuid,uuid,uuid)
from public,anon;
grant execute on function public.archive_department_function(uuid,uuid,uuid)
to authenticated;

create or replace function public.list_department_member_functions(
  p_organization_id uuid,
  p_department_id uuid
)
returns table(
  person_id uuid,
  function_id uuid,
  function_name text
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select dmf.person_id,dmf.function_id,f.name
  from public.department_member_functions dmf
  join public.department_functions f
    on f.id=dmf.function_id
   and f.department_id=dmf.department_id
   and f.organization_id=dmf.organization_id
  where dmf.organization_id=p_organization_id
    and dmf.department_id=p_department_id
    and dmf.active=true
    and f.active=true
    and app_private.is_org_member(p_organization_id)
  order by dmf.person_id,f.sort_order,f.name;
$function$;

revoke all on function public.list_department_member_functions(uuid,uuid)
from public,anon;
grant execute on function public.list_department_member_functions(uuid,uuid)
to authenticated;

create or replace function public.set_department_member_functions(
  p_organization_id uuid,
  p_department_id uuid,
  p_person_id uuid,
  p_function_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_unit_id uuid;
  v_function_id uuid;
  v_count integer:=0;
begin
  select unit_id into v_unit_id
  from public.departments
  where id=p_department_id
    and organization_id=p_organization_id
    and active=true;

  if v_unit_id is null
     or not app_private.has_permission(
       p_organization_id,'departments.manage',v_unit_id
     ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.department_members dm
    where dm.organization_id=p_organization_id
      and dm.department_id=p_department_id
      and dm.person_id=p_person_id
      and dm.status='active'
  ) then
    raise exception 'Person is not active in this department';
  end if;

  update public.department_member_functions
  set active=false
  where organization_id=p_organization_id
    and department_id=p_department_id
    and person_id=p_person_id;

  foreach v_function_id in array coalesce(p_function_ids,'{}'::uuid[])
  loop
    if not exists (
      select 1
      from public.department_functions f
      where f.id=v_function_id
        and f.organization_id=p_organization_id
        and f.department_id=p_department_id
        and f.active=true
    ) then
      raise exception 'Invalid department function';
    end if;

    insert into public.department_member_functions(
      organization_id,department_id,person_id,function_id,active
    )
    values(
      p_organization_id,p_department_id,p_person_id,v_function_id,true
    )
    on conflict(function_id,person_id)
    do update set active=true;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.set_department_member_functions(
  uuid,uuid,uuid,uuid[]
) from public,anon;
grant execute on function public.set_department_member_functions(
  uuid,uuid,uuid,uuid[]
) to authenticated;

create or replace function app_private.schedule_candidate_eligible(
  p_rule_id uuid,
  p_person_id uuid,
  p_event_id uuid,
  p_ignore_assignment_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_rule public.schedule_rules%rowtype;
  v_event public.events%rowtype;
begin
  select * into v_rule
  from public.schedule_rules
  where id=p_rule_id and active=true;

  if not found then return false; end if;

  select * into v_event
  from public.events
  where id=p_event_id
    and organization_id=v_rule.organization_id
    and status='published';

  if not found then return false; end if;

  if not exists (
    select 1
    from public.department_members dm
    join public.people p
      on p.id=dm.person_id and p.organization_id=dm.organization_id
    join public.organization_memberships om
      on om.person_id=p.id and om.organization_id=p.organization_id
    where dm.department_id=v_rule.department_id
      and dm.organization_id=v_rule.organization_id
      and dm.person_id=p_person_id
      and dm.status='active'
      and dm.can_serve=true
      and p.record_status='active'
      and om.status='active'
  ) then
    return false;
  end if;

  if v_rule.department_function_id is not null
     and not exists (
       select 1
       from public.department_member_functions dmf
       where dmf.organization_id=v_rule.organization_id
         and dmf.department_id=v_rule.department_id
         and dmf.person_id=p_person_id
         and dmf.function_id=v_rule.department_function_id
         and dmf.active=true
     ) then
    return false;
  end if;

  if exists (
    select 1
    from public.schedule_assignments prior
    where prior.organization_id=v_rule.organization_id
      and prior.rule_id=v_rule.id
      and prior.event_id=v_event.id
      and prior.person_id=p_person_id
      and prior.status in ('declined','replaced')
      and (p_ignore_assignment_id is null or prior.id<>p_ignore_assignment_id)
  ) then return false; end if;

  if exists (
    select 1
    from public.person_unavailability pu
    where pu.organization_id=v_rule.organization_id
      and pu.person_id=p_person_id
      and pu.starts_at < coalesce(v_event.ends_at,v_event.starts_at+interval '2 hours')
      and pu.ends_at > v_event.starts_at
  ) then return false; end if;

  if exists (
    select 1
    from public.schedule_assignments sa
    join public.events e2
      on e2.id=sa.event_id and e2.organization_id=sa.organization_id
    where sa.organization_id=v_rule.organization_id
      and sa.person_id=p_person_id
      and sa.status in ('pending','confirmed','replacement_requested')
      and (p_ignore_assignment_id is null or sa.id<>p_ignore_assignment_id)
      and e2.status<>'cancelled'
      and e2.starts_at < coalesce(v_event.ends_at,v_event.starts_at+interval '2 hours')
      and coalesce(e2.ends_at,e2.starts_at+interval '2 hours') > v_event.starts_at
  ) then return false; end if;

  if v_rule.min_rest_days>0 and exists (
    select 1
    from public.schedule_assignments sa
    join public.events e2
      on e2.id=sa.event_id and e2.organization_id=sa.organization_id
    where sa.organization_id=v_rule.organization_id
      and sa.department_id=v_rule.department_id
      and sa.person_id=p_person_id
      and sa.status in ('pending','confirmed','replacement_requested')
      and (p_ignore_assignment_id is null or sa.id<>p_ignore_assignment_id)
      and e2.status<>'cancelled'
      and e2.starts_at < v_event.starts_at
      and e2.starts_at >= v_event.starts_at - make_interval(days=>v_rule.min_rest_days)
  ) then return false; end if;

  return true;
end;
$function$;

create or replace function public.save_event_schedule_function_rule(
  p_organization_id uuid,
  p_department_id uuid,
  p_event_id uuid,
  p_department_function_id uuid,
  p_required_count integer default null,
  p_rotation_mode text default 'balanced',
  p_min_rest_days integer default 0
)
returns public.schedule_rules
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_department public.departments%rowtype;
  v_event public.events%rowtype;
  v_function public.department_functions%rowtype;
  v_result public.schedule_rules%rowtype;
  v_required integer;
  v_rest integer:=greatest(0,least(coalesce(p_min_rest_days,0),90));
  v_rotation text:=lower(coalesce(p_rotation_mode,'balanced'));
  v_horizon integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_department
  from public.departments
  where id=p_department_id
    and organization_id=p_organization_id
    and active=true;

  if not found then raise exception 'Department not found'; end if;

  select * into v_event
  from public.events
  where id=p_event_id
    and organization_id=p_organization_id
    and status='published';

  if not found then raise exception 'Service occurrence not found'; end if;

  select * into v_function
  from public.department_functions
  where id=p_department_function_id
    and organization_id=p_organization_id
    and department_id=p_department_id
    and active=true;

  if not found then raise exception 'Department function not found'; end if;

  if v_department.unit_id<>v_event.unit_id then
    raise exception 'Department and service must belong to the same unit';
  end if;

  if not app_private.has_permission(
    p_organization_id,'schedules.manage',v_department.unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_rotation not in ('balanced','fixed') then
    raise exception 'Invalid rotation mode';
  end if;

  v_required:=greatest(
    1,
    least(coalesce(p_required_count,v_function.default_required_count),50)
  );

  v_horizon:=greatest(
    7,
    least(
      180,
      ceil(
        greatest(
          0,
          extract(epoch from (v_event.starts_at-now())) / 86400.0
        )
      )::integer + 1
    )
  );

  select * into v_result
  from public.schedule_rules
  where organization_id=p_organization_id
    and department_id=p_department_id
    and event_id=p_event_id
    and department_function_id=p_department_function_id
    and active=true
  limit 1
  for update;

  if found then
    update public.schedule_rules
    set role_label=v_function.name,
        required_count=v_required,
        rotation_mode=v_rotation,
        min_rest_days=v_rest,
        horizon_days=v_horizon,
        updated_at=now()
    where id=v_result.id
    returning * into v_result;
  else
    insert into public.schedule_rules(
      organization_id,department_id,routine_id,event_id,
      department_function_id,role_label,required_count,
      rotation_mode,min_rest_days,horizon_days,active,created_by
    )
    values(
      p_organization_id,p_department_id,null,p_event_id,
      p_department_function_id,v_function.name,v_required,
      v_rotation,v_rest,v_horizon,true,auth.uid()
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.save_event_schedule_function_rule(
  uuid,uuid,uuid,uuid,integer,text,integer
) from public,anon;
grant execute on function public.save_event_schedule_function_rule(
  uuid,uuid,uuid,uuid,integer,text,integer
) to authenticated;

create or replace function public.apply_department_schedule_template(
  p_organization_id uuid,
  p_department_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_function record;
  v_rule public.schedule_rules%rowtype;
  v_created integer:=0;
begin
  if not exists (
    select 1
    from public.department_functions f
    where f.organization_id=p_organization_id
      and f.department_id=p_department_id
      and f.active=true
  ) then
    raise exception 'This department has no active functions';
  end if;

  for v_function in
    select id
    from public.department_functions
    where organization_id=p_organization_id
      and department_id=p_department_id
      and active=true
    order by sort_order,name
  loop
    select *
    into v_rule
    from public.save_event_schedule_function_rule(
      p_organization_id,p_department_id,p_event_id,
      v_function.id,null,'balanced',0
    );

    v_created:=v_created+1;
  end loop;

  return jsonb_build_object(
    'functions_applied',v_created,
    'department_id',p_department_id,
    'event_id',p_event_id
  );
end;
$function$;

revoke all on function public.apply_department_schedule_template(uuid,uuid,uuid)
from public,anon;
grant execute on function public.apply_department_schedule_template(uuid,uuid,uuid)
to authenticated;

create or replace function public.respond_my_schedule(
  p_assignment_id uuid,
  p_response text
)
returns public.schedule_assignments
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_assignment public.schedule_assignments%rowtype;
  v_response text:=lower(trim(coalesce(p_response,'')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select sa.* into v_assignment
  from public.schedule_assignments sa
  join public.people p
    on p.id=sa.person_id and p.organization_id=sa.organization_id
  where sa.id=p_assignment_id
    and p.auth_user_id=auth.uid()
  for update of sa;

  if not found then
    raise exception 'Assignment not found' using errcode='42501';
  end if;

  if v_assignment.status not in ('pending','confirmed') then
    raise exception 'Assignment cannot be changed now';
  end if;

  if v_response in ('confirm','confirmed') then
    update public.schedule_assignments
    set status='confirmed',response_at=now(),updated_at=now()
    where id=p_assignment_id
    returning * into v_assignment;

    perform app_private.enqueue_schedule_notice(
      v_assignment.organization_id,v_assignment.person_id,
      'schedule.confirmed',
      jsonb_build_object(
        'assignment_id',v_assignment.id,
        'event_id',v_assignment.event_id
      ),
      'schedule.confirmed:'||v_assignment.id::text
    );

  elsif v_response in ('decline','declined') then
    update public.schedule_assignments
    set status='declined',response_at=now(),updated_at=now()
    where id=p_assignment_id
    returning * into v_assignment;

    perform app_private.enqueue_schedule_notice(
      v_assignment.organization_id,null,
      'schedule.declined',
      jsonb_build_object(
        'assignment_id',v_assignment.id,
        'event_id',v_assignment.event_id,
        'person_id',v_assignment.person_id
      ),
      'schedule.declined:'||v_assignment.id::text
    );

    perform app_private.generate_schedules(v_assignment.organization_id,60);
  else
    raise exception 'Invalid response';
  end if;

  perform app_private.write_audit(
    v_assignment.organization_id,null,
    'schedule.response','schedule_assignments',
    v_assignment.id,
    jsonb_build_object('response',v_response)
  );

  return v_assignment;
end;
$function$;

notify pgrst,'reload schema';
