
create or replace function public.set_department_leader(
  p_organization_id uuid,
  p_department_id uuid,
  p_person_id uuid
)
returns public.departments
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_department public.departments%rowtype;
  v_result public.departments%rowtype;
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

  if not app_private.has_permission(
    p_organization_id,
    'departments.manage',
    v_department.unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if p_person_id is not null and not exists (
    select 1
    from public.people p
    join public.unit_memberships um
      on um.person_id=p.id
     and um.organization_id=p.organization_id
    where p.id=p_person_id
      and p.organization_id=p_organization_id
      and p.record_status='active'
      and um.unit_id=v_department.unit_id
      and um.status='active'
  ) then
    raise exception 'Leader must be active in this unit';
  end if;

  update public.departments
  set leader_person_id=p_person_id,
      updated_at=now()
  where id=p_department_id
    and organization_id=p_organization_id
  returning * into v_result;

  perform app_private.write_audit(
    p_organization_id,
    v_department.unit_id,
    'department.leader_changed',
    'departments',
    p_department_id,
    jsonb_build_object('leader_person_id',p_person_id)
  );

  return v_result;
end;
$function$;

revoke all on function public.set_department_leader(uuid,uuid,uuid)
from public,anon;
grant execute on function public.set_department_leader(uuid,uuid,uuid)
to authenticated;

notify pgrst,'reload schema';
