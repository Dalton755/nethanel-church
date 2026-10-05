-- Nethanel Elo v47c
-- Fecha a função interna de vinculação e preserva acesso já pago após cancelamento.

create or replace function public.billing_attach_provider_subscription(
  p_checkout_session_id uuid,
  p_provider_subscription_id text,
  p_checkout_url text,
  p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.platform_checkout_sessions%rowtype;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select * into v_row
  from public.platform_checkout_sessions pcs
  where pcs.id = p_checkout_session_id
  for update;

  if not found then
    raise exception 'Sessão de checkout não encontrada.';
  end if;

  update public.platform_checkout_sessions
  set provider_subscription_id = nullif(trim(p_provider_subscription_id),''),
      checkout_url = nullif(trim(p_checkout_url),''),
      provider_payload = coalesce(p_provider_payload,'{}'::jsonb),
      status = 'pending',
      updated_at = now()
  where id = p_checkout_session_id;

  return jsonb_build_object('ok',true,'checkout_session_id',p_checkout_session_id);
end;
$$;

revoke all on function public.billing_attach_provider_subscription(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.billing_attach_provider_subscription(uuid,text,text,jsonb) to service_role;

create or replace function public.get_organization_plan_context(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
  v_blessed boolean := false;
  v_billing_code text;
  v_billing_status text;
  v_provider text;
  v_provider_subscription_id text;
  v_period_end timestamptz;
  v_effective_code text;
  v_people_count integer := 0;
  v_is_trial boolean := false;
  v_grace_days integer := 0;
  v_in_grace boolean := false;
  v_canceled_access boolean := false;
  v_access_ends_at timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select (
    exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid() and pa.active = true
    )
    or exists (
      select 1
      from public.people p
      join public.organization_memberships om
        on om.organization_id = p.organization_id
       and om.person_id = p.id
       and om.status = 'active'
      where p.organization_id = p_organization_id
        and p.auth_user_id = auth.uid()
        and p.record_status = 'active'
    )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Insufficient organization access' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.platform_church_blessings b
    where b.organization_id = p_organization_id and b.active = true
  ) into v_blessed;

  select os.plan_code, os.status, os.provider, os.provider_subscription_id, os.current_period_end
  into v_billing_code, v_billing_status, v_provider, v_provider_subscription_id, v_period_end
  from public.organization_subscriptions os
  where os.organization_id = p_organization_id
  limit 1;

  v_billing_code := coalesce(v_billing_code, 'GRATUITO');
  v_billing_status := coalesce(v_billing_status, 'active');

  select coalesce(sp.grace_period_days,0)
  into v_grace_days
  from public.subscription_plans sp
  where sp.code = v_billing_code;
  v_grace_days := coalesce(v_grace_days,0);

  v_is_trial := (
    v_provider = 'internal_trial'
    and v_billing_status = 'pending'
    and v_period_end is not null
    and v_period_end > now()
  );

  v_canceled_access := (
    v_provider = 'mercado_pago'
    and v_billing_status = 'canceled'
    and v_period_end is not null
    and v_period_end > now()
  );

  v_in_grace := (
    v_provider = 'mercado_pago'
    and v_billing_status = 'past_due'
    and v_period_end is not null
    and v_period_end + make_interval(days => v_grace_days) > now()
  );

  v_effective_code := case
    when v_blessed then 'ELO_WHITE_LABEL'
    when v_billing_status = 'active' then v_billing_code
    when v_is_trial then v_billing_code
    when v_canceled_access then v_billing_code
    when v_in_grace then v_billing_code
    else 'GRATUITO'
  end;

  v_access_ends_at := case
    when v_is_trial then v_period_end
    when v_canceled_access then v_period_end
    when v_in_grace then v_period_end + make_interval(days => v_grace_days)
    else null
  end;

  select count(*)::integer into v_people_count
  from public.people p
  where p.organization_id = p_organization_id
    and p.record_status = 'active';

  select jsonb_build_object(
    'organization_id', p_organization_id,
    'is_blessed', v_blessed,
    'is_trial', v_is_trial,
    'is_grace_period', v_in_grace,
    'renewal_canceled', v_canceled_access,
    'trial_ends_at', case when v_is_trial then v_period_end else null end,
    'access_ends_at', v_access_ends_at,
    'subscription_status', v_billing_status,
    'subscription_provider', v_provider,
    'current_period_end', v_period_end,
    'can_cancel_subscription', (
      not v_blessed
      and v_provider = 'mercado_pago'
      and v_billing_status = 'active'
      and v_provider_subscription_id is not null
    ),
    'billing_plan_code', v_billing_code,
    'effective_plan_code', v_effective_code,
    'price_cents', case when v_blessed or v_is_trial then 0 else sp.price_cents end,
    'name', case
      when v_blessed then 'Elo Abençoar'
      when v_is_trial then 'Teste Elo Completo'
      else sp.name
    end,
    'base_plan_name', sp.name,
    'limits', sp.limits,
    'features', sp.features,
    'usage', jsonb_build_object('people', v_people_count)
  ) into v_result
  from public.subscription_plans sp
  where sp.code = v_effective_code;

  return v_result;
end;
$$;

revoke all on function public.get_organization_plan_context(uuid) from public, anon;
grant execute on function public.get_organization_plan_context(uuid) to authenticated;
