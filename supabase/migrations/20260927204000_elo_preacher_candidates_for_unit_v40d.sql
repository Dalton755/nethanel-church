-- ELO v40d — candidatos a pregador antes de criar o culto

create or replace function public.list_preacher_candidates_for_unit(
  p_organization_id uuid,
  p_unit_id uuid
)
returns table(
  person_id uuid,
  person_name text,
  email text,
  has_login boolean
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if p_unit_id is null or not app_private.has_permission(
    p_organization_id,
    'schedules.manage',
    p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(p.preferred_name,''), p.full_name),
    p.email,
    p.auth_user_id is not null
  from public.people p
  where p.organization_id = p_organization_id
    and p.record_status = 'active'
    and not exists (
      select 1
      from public.kids_children kc
      where kc.organization_id = p.organization_id
        and kc.child_person_id = p.id
        and kc.active = true
    )
  order by
    (p.auth_user_id is not null) desc,
    lower(coalesce(nullif(p.preferred_name,''), p.full_name));
end;
$function$;

revoke all on function public.list_preacher_candidates_for_unit(uuid, uuid)
from public, anon;

grant execute on function public.list_preacher_candidates_for_unit(uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';
