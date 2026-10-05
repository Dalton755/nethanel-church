-- Nethanel Elo v46e
-- Toda nova igreja começa com 14 dias do Elo Completo, sem cartão e sem contar como MRR.

create or replace function app_private.start_elo_complete_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_subscriptions(
    organization_id,
    plan_code,
    status,
    provider,
    provider_subscription_id,
    current_period_end,
    created_at,
    updated_at
  )
  values (
    new.id,
    'ELO_COMPLETO',
    'pending',
    'internal_trial',
    null,
    now() + interval '14 days',
    now(),
    now()
  )
  on conflict (organization_id) do update
  set plan_code = 'ELO_COMPLETO',
      status = 'pending',
      provider = 'internal_trial',
      provider_subscription_id = null,
      current_period_end = now() + interval '14 days',
      updated_at = now();

  return new;
end;
$$;

revoke all on function app_private.start_elo_complete_trial()
from public, anon, authenticated;

drop trigger if exists zz_organizations_start_elo_complete_trial
on public.organizations;

create trigger zz_organizations_start_elo_complete_trial
after insert on public.organizations
for each row
execute function app_private.start_elo_complete_trial();

create or replace function app_private.organization_effective_plan_code(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.platform_church_blessings b
      where b.organization_id = p_organization_id
        and b.active = true
    ) then 'ELO_WHITE_LABEL'
    else coalesce((
      select os.plan_code
      from public.organization_subscriptions os
      where os.organization_id = p_organization_id
        and (
          os.status = 'active'
          or (
            os.status = 'pending'
            and os.provider = 'internal_trial'
            and os.current_period_end > now()
          )
        )
      limit 1
    ), 'GRATUITO')
  end;
$$;

revoke all on function app_private.organization_effective_plan_code(uuid)
from public, anon, authenticated;
grant execute on function app_private.organization_effective_plan_code(uuid) to service_role;

create or replace function public.organization_has_full_access(p_organization_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    return false;
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
    return false;
  end if;

  return exists (
    select 1
    from public.platform_church_blessings b
    where b.organization_id = p_organization_id
      and b.active = true
  ) or exists (
    select 1
    from public.organization_subscriptions os
    join public.subscription_plans sp
      on sp.code = os.plan_code
    where os.organization_id = p_organization_id
      and sp.active = true
      and os.plan_code <> 'GRATUITO'
      and (
        os.status = 'active'
        or (
          os.status = 'pending'
          and os.provider = 'internal_trial'
          and os.current_period_end > now()
        )
      )
  );
end;
$$;

revoke all on function public.organization_has_full_access(uuid)
from public, anon;
grant execute on function public.organization_has_full_access(uuid) to authenticated;

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
    os.current_period_end
  into
    v_billing_code,
    v_billing_status,
    v_provider,
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

revoke all on function public.get_organization_plan_context(uuid)
from public, anon;
grant execute on function public.get_organization_plan_context(uuid) to authenticated;
