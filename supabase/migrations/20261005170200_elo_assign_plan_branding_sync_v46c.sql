-- Nethanel Elo v46c
-- Sincroniza o modo white label ao trocar o plano pelo Painel Nethanel.

create or replace function public.platform_admin_assign_plan(
  p_organization_id uuid,
  p_plan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous jsonb;
  v_next jsonb;
  v_blessed boolean := false;
begin
  if auth.uid() is null or not exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid() and pa.active = true
  ) then
    raise exception 'Acesso restrito ao administrador da plataforma.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.status <> 'archived'
  ) then
    raise exception 'Igreja não encontrada.';
  end if;

  if not exists (
    select 1 from public.subscription_plans sp
    where sp.code = p_plan_code
      and sp.active = true
      and sp.public_visible = true
  ) then
    raise exception 'Plano comercial inválido.';
  end if;

  select to_jsonb(os) into v_previous
  from public.organization_subscriptions os
  where os.organization_id = p_organization_id;

  insert into public.organization_subscriptions(
    organization_id, plan_code, status, created_at, updated_at
  ) values (
    p_organization_id, p_plan_code, 'active', now(), now()
  )
  on conflict (organization_id) do update
  set plan_code = excluded.plan_code,
      status = 'active',
      updated_at = now();

  select exists (
    select 1 from public.platform_church_blessings b
    where b.organization_id = p_organization_id
      and b.active = true
  ) into v_blessed;

  update public.organizations
  set white_label_enabled = (
        v_blessed
        or p_plan_code in ('ELO_WHITE_LABEL', 'ELO_REDE')
      ),
      updated_at = now()
  where id = p_organization_id;

  select to_jsonb(os) into v_next
  from public.organization_subscriptions os
  where os.organization_id = p_organization_id;

  insert into public.platform_admin_changes(
    admin_user_id, change_type, previous_value, new_value
  ) values (
    auth.uid(),
    'organization_plan_assigned',
    v_previous,
    v_next || jsonb_build_object(
      'white_label_enabled',
      (v_blessed or p_plan_code in ('ELO_WHITE_LABEL', 'ELO_REDE'))
    )
  );

  return public.platform_admin_dashboard();
end;
$$;

revoke all on function public.platform_admin_assign_plan(uuid, text) from public, anon;
grant execute on function public.platform_admin_assign_plan(uuid, text) to authenticated;
