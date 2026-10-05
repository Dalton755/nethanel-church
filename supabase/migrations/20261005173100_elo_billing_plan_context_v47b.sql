-- Nethanel Elo v47b
-- Complementa o contexto do plano com origem da assinatura e possibilidade de cancelamento.

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
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select (
    exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = auth.uid()
        and pa.active = true
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
    select 1
    from public.platform_church_blessings b
    where b.organization_id = p_organization_id
      and b.active = true
  ) into v_blessed;

  select
    os.plan_code,
    os.status,
    os.provider,
    os.provider_subscription_id,
    os.current_period_end
  into
    v_billing_code,
    v_billing_status,
    v_provider,
    v_provider_subscription_id,
    v_period_end
  from public.organization_subscriptions os
  where os.organization_id = p_organization_id
  limit 1;

  v_billing_code := coalesce(v_billing_code, 'GRATUITO');
  v_billing_status := coalesce(v_billing_status, 'active');

  v_is_trial := (
    v_provider = 'internal_trial'
    and v_billing_status = 'pending'
    and v_period_end is not null
    and v_period_end > now()
  );

  v_effective_code := case
    when v_blessed then 'ELO_WHITE_LABEL'
    when v_billing_status = 'active' then v_billing_code
    when v_is_trial then v_billing_code
    else 'GRATUITO'
  end;

  select count(*)::integer
  into v_people_count
  from public.people p
  where p.organization_id = p_organization_id
    and p.record_status = 'active';

  select jsonb_build_object(
    'organization_id', p_organization_id,
    'is_blessed', v_blessed,
    'is_trial', v_is_trial,
    'trial_ends_at', case when v_is_trial then v_period_end else null end,
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
    'price_cents', case
      when v_blessed or v_is_trial then 0
      else sp.price_cents
    end,
    'name', case
      when v_blessed then 'Elo Abençoar'
      when v_is_trial then 'Teste Elo Completo'
      else sp.name
    end,
    'base_plan_name', sp.name,
    'limits', sp.limits,
    'features', sp.features,
    'usage', jsonb_build_object('people', v_people_count)
  )
  into v_result
  from public.subscription_plans sp
  where sp.code = v_effective_code;

  return v_result;
end;
$$;

revoke all on function public.get_organization_plan_context(uuid) from public, anon;
grant execute on function public.get_organization_plan_context(uuid) to authenticated;
