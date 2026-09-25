-- Primeiro criador = ADMIN funcional + owner técnico.
create or replace function app_private.ensure_owner_admin_assignment()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_role_key text;
  v_admin_role_id uuid;
begin
  select lower(r.role_key)
  into v_role_key
  from public.roles r
  where r.id=new.role_id
    and r.organization_id=new.organization_id;

  if v_role_key <> 'owner' then
    return new;
  end if;

  perform app_private.ensure_elo_system_roles(new.organization_id);

  select r.id
  into v_admin_role_id
  from public.roles r
  where r.organization_id=new.organization_id
    and lower(r.role_key)='admin'
    and r.is_active=true
  limit 1;

  if v_admin_role_id is not null
     and not exists (
       select 1
       from public.user_role_assignments ura
       where ura.organization_id=new.organization_id
         and ura.person_id=new.person_id
         and ura.role_id=v_admin_role_id
         and ura.unit_id is null
         and (ura.ends_at is null or ura.ends_at>=current_date)
     )
  then
    insert into public.user_role_assignments(
      organization_id,person_id,role_id,unit_id,created_by
    )
    values(
      new.organization_id,new.person_id,v_admin_role_id,null,new.created_by
    );
  end if;

  return new;
end;
$function$;

revoke all on function app_private.ensure_owner_admin_assignment()
from public,anon,authenticated;

drop trigger if exists owner_also_admin_after_assignment
on public.user_role_assignments;

create trigger owner_also_admin_after_assignment
after insert on public.user_role_assignments
for each row
execute function app_private.ensure_owner_admin_assignment();

do $$
declare
  v_owner record;
  v_admin_role_id uuid;
begin
  for v_owner in
    select ura.organization_id,ura.person_id,ura.created_by
    from public.user_role_assignments ura
    join public.roles r
      on r.id=ura.role_id
     and r.organization_id=ura.organization_id
    where lower(r.role_key)='owner'
      and (ura.ends_at is null or ura.ends_at>=current_date)
  loop
    perform app_private.ensure_elo_system_roles(v_owner.organization_id);

    select r.id into v_admin_role_id
    from public.roles r
    where r.organization_id=v_owner.organization_id
      and lower(r.role_key)='admin'
      and r.is_active=true
    limit 1;

    if v_admin_role_id is not null
       and not exists (
         select 1 from public.user_role_assignments x
         where x.organization_id=v_owner.organization_id
           and x.person_id=v_owner.person_id
           and x.role_id=v_admin_role_id
           and x.unit_id is null
           and (x.ends_at is null or x.ends_at>=current_date)
       )
    then
      insert into public.user_role_assignments(
        organization_id,person_id,role_id,unit_id,created_by
      )
      values(
        v_owner.organization_id,v_owner.person_id,v_admin_role_id,null,v_owner.created_by
      );
    end if;
  end loop;
end $$;

create or replace function public.list_my_schedule(
  p_organization_id uuid
)
returns table(
  assignment_id uuid,
  organization_id uuid,
  person_id uuid,
  event_id uuid,
  department_id uuid,
  department_name text,
  role_label text,
  status text,
  source text,
  response_at timestamptz,
  event_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  event_status text,
  location_name text,
  timezone text,
  checked_in_at timestamptz,
  checkin_method text,
  substitution_request_id uuid,
  substitution_status text,
  can_checkin boolean
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    sa.id,
    sa.organization_id,
    sa.person_id,
    sa.event_id,
    sa.department_id,
    d.name,
    sa.role_label,
    sa.status,
    sa.source,
    sa.response_at,
    e.title,
    e.starts_at,
    e.ends_at,
    e.status,
    e.location_name,
    u.timezone,
    sc.checked_in_at,
    sc.method,
    srq.id,
    srq.status,
    now() >= e.starts_at - interval '2 hours'
      and now() <= coalesce(e.ends_at,e.starts_at+interval '3 hours') + interval '2 hours'
  from public.schedule_assignments sa
  join public.people p
    on p.id=sa.person_id
   and p.organization_id=sa.organization_id
  join public.organization_memberships om
    on om.person_id=p.id
   and om.organization_id=p.organization_id
   and om.status='active'
  join public.departments d
    on d.id=sa.department_id
   and d.organization_id=sa.organization_id
  join public.events e
    on e.id=sa.event_id
   and e.organization_id=sa.organization_id
  join public.units u
    on u.id=e.unit_id
   and u.organization_id=e.organization_id
  left join public.schedule_checkins sc
    on sc.assignment_id=sa.id
   and sc.organization_id=sa.organization_id
  left join lateral (
    select r.id,r.status
    from public.schedule_substitution_requests r
    where r.assignment_id=sa.id
    order by r.created_at desc
    limit 1
  ) srq on true
  where sa.organization_id=p_organization_id
    and p.auth_user_id=auth.uid();
$function$;

revoke all on function public.list_my_schedule(uuid) from public,anon;
grant execute on function public.list_my_schedule(uuid) to authenticated;

create or replace function app_private.materialize_service_routine_change()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
begin
  perform app_private.materialize_service_agenda(
    coalesce(new.organization_id,old.organization_id),
    current_date-45,
    400
  );
  return coalesce(new,old);
end;
$function$;

revoke all on function app_private.materialize_service_routine_change()
from public,anon,authenticated;

drop trigger if exists service_routines_materialize_now
on public.service_routines;

create trigger service_routines_materialize_now
after insert or update of
  active,weekday,start_time,duration_minutes,start_date,location_name,visibility
on public.service_routines
for each row
execute function app_private.materialize_service_routine_change();
