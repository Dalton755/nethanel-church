-- ELO v33: recuperar séries e escalas de ponta a ponta.

-- 1) Remove a recursão de RLS entre pedidos e candidatos de substituição.
create or replace function app_private.is_schedule_substitution_candidate(
  p_request_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select exists (
    select 1
    from public.schedule_substitution_candidates sc
    where sc.request_id=p_request_id
      and sc.organization_id=p_organization_id
      and app_private.is_person_self(sc.person_id,sc.organization_id)
  );
$function$;

create or replace function app_private.can_manage_schedule_substitution(
  p_request_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select exists (
    select 1
    from public.schedule_substitution_requests sr
    join public.schedule_assignments sa
      on sa.id=sr.assignment_id
     and sa.organization_id=sr.organization_id
    join public.departments d
      on d.id=sa.department_id
     and d.organization_id=sa.organization_id
    where sr.id=p_request_id
      and sr.organization_id=p_organization_id
      and app_private.has_permission(
        p_organization_id,
        'schedules.manage',
        d.unit_id
      )
  );
$function$;

revoke all on function app_private.is_schedule_substitution_candidate(uuid,uuid)
from public,anon;
grant execute on function app_private.is_schedule_substitution_candidate(uuid,uuid)
to authenticated;

revoke all on function app_private.can_manage_schedule_substitution(uuid,uuid)
from public,anon;
grant execute on function app_private.can_manage_schedule_substitution(uuid,uuid)
to authenticated;

drop policy if exists "substitution_requests_select_allowed"
on public.schedule_substitution_requests;

create policy "substitution_requests_select_allowed"
on public.schedule_substitution_requests
for select
to authenticated
using (
  app_private.is_person_self(requested_by_person_id,organization_id)
  or (
    accepted_by_person_id is not null
    and app_private.is_person_self(accepted_by_person_id,organization_id)
  )
  or app_private.is_schedule_substitution_candidate(id,organization_id)
  or app_private.can_manage_schedule_substitution(id,organization_id)
);

drop policy if exists "substitution_candidates_select_allowed"
on public.schedule_substitution_candidates;

create policy "substitution_candidates_select_allowed"
on public.schedule_substitution_candidates
for select
to authenticated
using (
  app_private.is_person_self(person_id,organization_id)
  or app_private.can_manage_schedule_substitution(request_id,organization_id)
);

-- 2) Série sempre respeita a organização da rotina.
drop policy if exists "service_series_insert_manager"
on public.service_series;
drop policy if exists "service_series_update_manager"
on public.service_series;
drop policy if exists "service_series_delete_manager"
on public.service_series;

create policy "service_series_insert_manager"
on public.service_series
for insert
to authenticated
with check (
  created_by=auth.uid()
  and exists (
    select 1
    from public.service_routines r
    where r.id=service_series.routine_id
      and r.organization_id=service_series.organization_id
      and app_private.has_permission(
        service_series.organization_id,
        'services.manage',
        r.unit_id
      )
  )
);

create policy "service_series_update_manager"
on public.service_series
for update
to authenticated
using (
  exists (
    select 1
    from public.service_routines r
    where r.id=service_series.routine_id
      and r.organization_id=service_series.organization_id
      and app_private.has_permission(
        service_series.organization_id,
        'services.manage',
        r.unit_id
      )
  )
)
with check (
  exists (
    select 1
    from public.service_routines r
    where r.id=service_series.routine_id
      and r.organization_id=service_series.organization_id
      and app_private.has_permission(
        service_series.organization_id,
        'services.manage',
        r.unit_id
      )
  )
);

create policy "service_series_delete_manager"
on public.service_series
for delete
to authenticated
using (
  exists (
    select 1
    from public.service_routines r
    where r.id=service_series.routine_id
      and r.organization_id=service_series.organization_id
      and app_private.has_permission(
        service_series.organization_id,
        'services.manage',
        r.unit_id
      )
  )
);

-- 3) RPC simples para configurar uma regra de escala de uma rotina.
create or replace function public.save_schedule_rule(
  p_organization_id uuid,
  p_department_id uuid,
  p_routine_id uuid,
  p_role_label text,
  p_required_count integer default 1,
  p_rotation_mode text default 'balanced',
  p_min_rest_days integer default 0,
  p_horizon_days integer default 60
)
returns public.schedule_rules
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_department public.departments%rowtype;
  v_routine public.service_routines%rowtype;
  v_result public.schedule_rules%rowtype;
  v_role text:=trim(coalesce(p_role_label,''));
  v_required integer:=greatest(1,least(coalesce(p_required_count,1),50));
  v_rest integer:=greatest(0,least(coalesce(p_min_rest_days,0),90));
  v_horizon integer:=greatest(7,least(coalesce(p_horizon_days,60),180));
  v_rotation text:=lower(coalesce(p_rotation_mode,'balanced'));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_department
  from public.departments
  where id=p_department_id
    and organization_id=p_organization_id
    and active=true;

  if not found then
    raise exception 'Department not found';
  end if;

  select * into v_routine
  from public.service_routines
  where id=p_routine_id
    and organization_id=p_organization_id
    and active=true;

  if not found then
    raise exception 'Service routine not found';
  end if;

  if v_department.unit_id<>v_routine.unit_id then
    raise exception 'Department and routine must belong to the same unit';
  end if;

  if not app_private.has_permission(
    p_organization_id,
    'schedules.manage',
    v_department.unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if length(v_role)<2 then
    raise exception 'Role label required';
  end if;

  if v_rotation not in ('balanced','fixed') then
    raise exception 'Invalid rotation mode';
  end if;

  select * into v_result
  from public.schedule_rules
  where organization_id=p_organization_id
    and department_id=p_department_id
    and routine_id=p_routine_id
    and event_id is null
    and lower(role_label)=lower(v_role)
    and active=true
  limit 1
  for update;

  if found then
    update public.schedule_rules
    set required_count=v_required,
        rotation_mode=v_rotation,
        min_rest_days=v_rest,
        horizon_days=v_horizon,
        updated_at=now()
    where id=v_result.id
    returning * into v_result;
  else
    insert into public.schedule_rules(
      organization_id,
      department_id,
      routine_id,
      event_id,
      role_label,
      required_count,
      rotation_mode,
      min_rest_days,
      horizon_days,
      active,
      created_by
    )
    values(
      p_organization_id,
      p_department_id,
      p_routine_id,
      null,
      v_role,
      v_required,
      v_rotation,
      v_rest,
      v_horizon,
      true,
      auth.uid()
    )
    returning * into v_result;
  end if;

  perform app_private.generate_schedules(
    p_organization_id,
    greatest(60,v_horizon)
  );

  perform app_private.write_audit(
    p_organization_id,
    v_department.unit_id,
    'schedule.rule_saved',
    'schedule_rules',
    v_result.id,
    jsonb_build_object(
      'department_id',p_department_id,
      'routine_id',p_routine_id,
      'role_label',v_role,
      'required_count',v_required,
      'rotation_mode',v_rotation
    )
  );

  return v_result;
end;
$function$;

revoke all on function public.save_schedule_rule(
  uuid,uuid,uuid,text,integer,text,integer,integer
) from public,anon;
grant execute on function public.save_schedule_rule(
  uuid,uuid,uuid,text,integer,text,integer,integer
) to authenticated;

-- 4) Atualização manual do motor aceita gestor de qualquer unidade autorizada.
create or replace function public.refresh_schedules(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not (
    app_private.has_permission(
      p_organization_id,
      'schedules.manage',
      null
    )
    or exists (
      select 1
      from public.departments d
      where d.organization_id=p_organization_id
        and d.active=true
        and app_private.has_permission(
          p_organization_id,
          'schedules.manage',
          d.unit_id
        )
    )
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  v_result:=app_private.generate_schedules(p_organization_id,60);

  perform app_private.write_audit(
    p_organization_id,
    null,
    'schedules.refreshed',
    'organizations',
    p_organization_id,
    v_result
  );

  return v_result;
end;
$function$;

revoke all on function public.refresh_schedules(uuid) from public,anon;
grant execute on function public.refresh_schedules(uuid) to authenticated;

notify pgrst,'reload schema';
