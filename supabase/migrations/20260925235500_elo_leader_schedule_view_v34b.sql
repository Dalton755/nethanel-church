
create or replace function public.list_my_led_departments(
  p_organization_id uuid
)
returns table(
  department_id uuid,
  department_name text,
  unit_id uuid
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    d.id,
    d.name,
    d.unit_id
  from public.departments d
  join public.people leader
    on leader.id=d.leader_person_id
   and leader.organization_id=d.organization_id
  where d.organization_id=p_organization_id
    and d.active=true
    and leader.auth_user_id=auth.uid()
    and leader.record_status='active'
  order by d.name;
$function$;

revoke all on function public.list_my_led_departments(uuid)
from public,anon;
grant execute on function public.list_my_led_departments(uuid)
to authenticated;

notify pgrst,'reload schema';
