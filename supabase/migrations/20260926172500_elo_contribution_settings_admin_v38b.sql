create or replace function public.get_contribution_settings_admin(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not (
    app_private.has_permission(p_organization_id,'finance.manage',null)
    or app_private.has_permission(p_organization_id,'organization.manage',null)
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select jsonb_build_object(
    'enabled',s.enabled,
    'pix_key_type',s.pix_key_type,
    'pix_key',s.pix_key,
    'pix_copy_paste',s.pix_copy_paste,
    'beneficiary_name',s.beneficiary_name,
    'bank_name',s.bank_name,
    'instructions',s.instructions
  )
  into v_result
  from public.organization_contribution_settings s
  where s.organization_id=p_organization_id;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function public.get_contribution_settings_admin(uuid)
  from public,anon,authenticated;
grant execute on function public.get_contribution_settings_admin(uuid)
  to authenticated;
