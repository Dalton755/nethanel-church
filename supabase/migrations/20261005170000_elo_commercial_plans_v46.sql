-- Nethanel Elo v46
-- Grade comercial oficial, limites por plano e contexto de entitlement.

alter table public.subscription_plans
  add column if not exists description text,
  add column if not exists features jsonb not null default '{}'::jsonb,
  add column if not exists public_visible boolean not null default false,
  add column if not exists recommended boolean not null default false,
  add column if not exists sort_order integer not null default 100;

insert into public.subscription_plans (
  code, name, description, price_cents, currency, billing_interval,
  active, trial_days, grace_period_days, limits, features,
  public_visible, recommended, sort_order, updated_at
)
values
(
  'ELO_ESSENCIAL', 'Elo Essencial',
  'Para igrejas pequenas que querem organizar toda a rotina no Elo.',
  4990, 'BRL', 'month', true, 14, 3,
  jsonb_build_object('units', 1, 'people', 100),
  jsonb_build_object(
    'church_logo', true, 'custom_colors', false,
    'finance_level', 'basic', 'reports_level', 'basic',
    'management_dashboard_level', 'basic', 'data_export', false,
    'custom_splash', false, 'custom_app_name', false,
    'custom_launcher_icon', false, 'standalone_apk', false,
    'custom_domain', false, 'remove_elo_brand', false,
    'multi_unit', false, 'support_level', 'standard'
  ),
  true, false, 10, now()
),
(
  'ELO_CRESCIMENTO', 'Elo Crescimento',
  'Para igrejas em crescimento que precisam de gestão completa e mais capacidade.',
  8990, 'BRL', 'month', true, 14, 3,
  jsonb_build_object('units', 1, 'people', 300),
  jsonb_build_object(
    'church_logo', true, 'custom_colors', true,
    'finance_level', 'full', 'reports_level', 'standard',
    'management_dashboard_level', 'full', 'data_export', true,
    'custom_splash', false, 'custom_app_name', false,
    'custom_launcher_icon', false, 'standalone_apk', false,
    'custom_domain', false, 'remove_elo_brand', false,
    'multi_unit', false, 'support_level', 'priority'
  ),
  true, true, 20, now()
),
(
  'ELO_COMPLETO', 'Elo Completo',
  'Para igrejas estruturadas que querem relatórios avançados e personalização ampliada.',
  14990, 'BRL', 'month', true, 14, 3,
  jsonb_build_object('units', 1, 'people', 1000),
  jsonb_build_object(
    'church_logo', true, 'custom_colors', true,
    'finance_level', 'full', 'reports_level', 'advanced',
    'management_dashboard_level', 'advanced', 'data_export', true,
    'custom_splash', true, 'custom_app_name', false,
    'custom_launcher_icon', false, 'standalone_apk', false,
    'custom_domain', 'optional', 'remove_elo_brand', false,
    'multi_unit', false, 'support_level', 'priority'
  ),
  true, false, 30, now()
),
(
  'ELO_WHITE_LABEL', 'Elo White Label',
  'O aplicativo da igreja com nome, ícone, splash e identidade próprios.',
  19990, 'BRL', 'month', true, 0, 3,
  jsonb_build_object('units', 1, 'people', 1000),
  jsonb_build_object(
    'church_logo', true, 'custom_colors', true,
    'finance_level', 'full', 'reports_level', 'advanced',
    'management_dashboard_level', 'advanced', 'data_export', true,
    'custom_splash', true, 'custom_app_name', true,
    'custom_launcher_icon', true, 'standalone_apk', true,
    'custom_domain', true, 'remove_elo_brand', true,
    'multi_unit', false, 'support_level', 'premium'
  ),
  true, false, 40, now()
),
(
  'ELO_REDE', 'Elo Rede',
  'Para ministérios com matriz e múltiplas congregações. Valor sob consulta.',
  null, 'BRL', 'month', true, 0, 3,
  jsonb_build_object('units', null, 'people', null),
  jsonb_build_object(
    'church_logo', true, 'custom_colors', true,
    'finance_level', 'full', 'reports_level', 'advanced',
    'management_dashboard_level', 'network', 'data_export', true,
    'custom_splash', true, 'custom_app_name', true,
    'custom_launcher_icon', true, 'standalone_apk', true,
    'custom_domain', true, 'remove_elo_brand', true,
    'multi_unit', true, 'network_dashboard', true,
    'support_level', 'premium'
  ),
  true, false, 50, now()
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    billing_interval = excluded.billing_interval,
    active = excluded.active,
    trial_days = excluded.trial_days,
    grace_period_days = excluded.grace_period_days,
    limits = excluded.limits,
    features = excluded.features,
    public_visible = excluded.public_visible,
    recommended = excluded.recommended,
    sort_order = excluded.sort_order,
    updated_at = now();

update public.subscription_plans
set public_visible = false,
    recommended = false,
    sort_order = 900,
    description = coalesce(description, 'Plano legado mantido para compatibilidade.'),
    limits = case
      when code = 'ELO_IGREJA' then jsonb_build_object('units', 1, 'people', 1000)
      else limits
    end,
    features = case
      when code = 'ELO_IGREJA' then jsonb_build_object(
        'church_logo', true, 'custom_colors', true,
        'finance_level', 'full', 'reports_level', 'advanced',
        'management_dashboard_level', 'advanced', 'data_export', true,
        'custom_splash', true, 'custom_app_name', false,
        'custom_launcher_icon', false, 'standalone_apk', false,
        'custom_domain', 'optional', 'remove_elo_brand', false,
        'multi_unit', false, 'support_level', 'priority'
      )
      else features
    end,
    updated_at = now()
where code in ('ELO_IGREJA', 'GRATUITO');

update public.organization_subscriptions os
set plan_code = 'ELO_WHITE_LABEL',
    updated_at = now()
where os.plan_code = 'ELO_IGREJA'
  and exists (
    select 1
    from public.organizations o
    where o.id = os.organization_id
      and o.white_label_enabled = true
  );

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
        and os.status = 'active'
      limit 1
    ), 'GRATUITO')
  end;
$$;

revoke all on function app_private.organization_effective_plan_code(uuid) from public, anon, authenticated;
grant execute on function app_private.organization_effective_plan_code(uuid) to service_role;

create or replace function app_private.organization_people_limit(p_organization_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when sp.limits ? 'people' and jsonb_typeof(sp.limits -> 'people') = 'number'
      then (sp.limits ->> 'people')::integer
    else null
  end
  from public.subscription_plans sp
  where sp.code = app_private.organization_effective_plan_code(p_organization_id)
  limit 1;
$$;

revoke all on function app_private.organization_people_limit(uuid) from public, anon, authenticated;
grant execute on function app_private.organization_people_limit(uuid) to service_role;

create or replace function app_private.enforce_people_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
  v_plan_name text;
begin
  if new.record_status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.record_status = 'active'
     and old.organization_id = new.organization_id then
    return new;
  end if;

  v_limit := app_private.organization_people_limit(new.organization_id);

  if v_limit is null then
    return new;
  end if;

  select count(*)::integer
  into v_count
  from public.people p
  where p.organization_id = new.organization_id
    and p.record_status = 'active'
    and p.id <> new.id;

  if v_count >= v_limit then
    select sp.name
    into v_plan_name
    from public.subscription_plans sp
    where sp.code = app_private.organization_effective_plan_code(new.organization_id);

    raise exception 'Limite de % pessoas do plano % atingido.', v_limit, coalesce(v_plan_name, 'atual')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_people_plan_limit() from public, anon, authenticated;

drop trigger if exists trg_people_plan_limit on public.people;
create trigger trg_people_plan_limit
before insert or update of record_status, organization_id
on public.people
for each row
execute function app_private.enforce_people_plan_limit();

create or replace function public.list_public_elo_plans()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code', sp.code,
      'name', sp.name,
      'description', sp.description,
      'price_cents', sp.price_cents,
      'currency', sp.currency,
      'billing_interval', sp.billing_interval,
      'trial_days', sp.trial_days,
      'limits', sp.limits,
      'features', sp.features,
      'recommended', sp.recommended
    ) order by sp.sort_order
  ), '[]'::jsonb)
  from public.subscription_plans sp
  where sp.active = true
    and sp.public_visible = true;
$$;

revoke all on function public.list_public_elo_plans() from public;
grant execute on function public.list_public_elo_plans() to anon, authenticated;

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
  v_effective_code text;
  v_people_count integer := 0;
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
    select 1 from public.platform_church_blessings b
    where b.organization_id = p_organization_id and b.active = true
  ) into v_blessed;

  select os.plan_code
  into v_billing_code
  from public.organization_subscriptions os
  where os.organization_id = p_organization_id
    and os.status = 'active'
  limit 1;

  v_billing_code := coalesce(v_billing_code, 'GRATUITO');
  v_effective_code := case when v_blessed then 'ELO_WHITE_LABEL' else v_billing_code end;

  select count(*)::integer
  into v_people_count
  from public.people p
  where p.organization_id = p_organization_id
    and p.record_status = 'active';

  select jsonb_build_object(
    'organization_id', p_organization_id,
    'is_blessed', v_blessed,
    'billing_plan_code', v_billing_code,
    'effective_plan_code', v_effective_code,
    'price_cents', case when v_blessed then 0 else sp.price_cents end,
    'name', case when v_blessed then 'Elo Abençoar' else sp.name end,
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

create or replace function public.platform_admin_plan_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid() and pa.active = true
  ) then
    raise exception 'Acesso restrito ao administrador da plataforma.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'code', sp.code,
        'name', sp.name,
        'description', sp.description,
        'price_cents', sp.price_cents,
        'currency', sp.currency,
        'billing_interval', sp.billing_interval,
        'trial_days', sp.trial_days,
        'grace_period_days', sp.grace_period_days,
        'limits', sp.limits,
        'features', sp.features,
        'recommended', sp.recommended,
        'sort_order', sp.sort_order
      ) order by sp.sort_order
    ), '[]'::jsonb)
    from public.subscription_plans sp
    where sp.active = true and sp.public_visible = true
  );
end;
$$;

revoke all on function public.platform_admin_plan_catalog() from public, anon;
grant execute on function public.platform_admin_plan_catalog() to authenticated;

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
begin
  if auth.uid() is null or not exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid() and pa.active = true
  ) then
    raise exception 'Acesso restrito ao administrador da plataforma.' using errcode = '42501';
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

  select to_jsonb(os) into v_next
  from public.organization_subscriptions os
  where os.organization_id = p_organization_id;

  insert into public.platform_admin_changes(admin_user_id, change_type, previous_value, new_value)
  values (auth.uid(), 'organization_plan_assigned', v_previous, v_next);

  return public.platform_admin_dashboard();
end;
$$;

revoke all on function public.platform_admin_assign_plan(uuid, text) from public, anon;
grant execute on function public.platform_admin_assign_plan(uuid, text) to authenticated;

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
    return false;
  end if;

  return exists (
    select 1 from public.platform_church_blessings b
    where b.organization_id = p_organization_id and b.active = true
  ) or exists (
    select 1
    from public.organization_subscriptions os
    join public.subscription_plans sp on sp.code = os.plan_code
    where os.organization_id = p_organization_id
      and os.status = 'active'
      and sp.active = true
      and os.plan_code <> 'GRATUITO'
  );
end;
$$;

revoke all on function public.organization_has_full_access(uuid) from public, anon;
grant execute on function public.organization_has_full_access(uuid) to authenticated;
