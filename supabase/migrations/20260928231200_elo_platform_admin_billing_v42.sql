-- Nethanel Elo v42
-- Painel gerencial da plataforma, cobrança central e auditoria.

alter table public.subscription_plans
  add column if not exists trial_days integer not null default 0 check (trial_days between 0 and 90),
  add column if not exists grace_period_days integer not null default 0 check (grace_period_days between 0 and 30),
  add column if not exists limits jsonb not null default '{}'::jsonb,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.subscription_plans
set price_cents = coalesce(price_cents, 5990),
    trial_days = case when trial_days = 0 then 14 else trial_days end,
    grace_period_days = case when grace_period_days = 0 then 3 else grace_period_days end,
    updated_at = now()
where code = 'ELO_IGREJA';

update public.subscription_plans
set price_cents = 0,
    trial_days = 0,
    grace_period_days = 0,
    limits = jsonb_build_object(
      'units', 1,
      'people', 50,
      'management_users', 2,
      'departments', 2,
      'active_service_series', 4
    ),
    updated_at = now()
where code = 'GRATUITO';

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon, authenticated;
grant select, insert, update, delete on table public.platform_admins to service_role;

insert into public.platform_admins(user_id, email, active)
values (
  '4892f15e-a70c-4838-a0ce-5b0bfc6839f1'::uuid,
  'rochadalton00@gmail.com',
  true
)
on conflict (user_id) do update
set email = excluded.email,
    active = true,
    updated_at = now();

create table if not exists public.platform_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.subscription_plans(code),
  provider text not null,
  provider_payment_id text not null,
  status text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create index if not exists platform_payments_org_idx
  on public.platform_payments(organization_id, created_at desc);

create index if not exists platform_payments_paid_at_idx
  on public.platform_payments(paid_at desc)
  where paid_at is not null;

alter table public.platform_payments enable row level security;
revoke all on table public.platform_payments from anon, authenticated;
grant select, insert, update, delete on table public.platform_payments to service_role;

create table if not exists public.platform_admin_changes (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  change_type text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_changes_created_at_idx
  on public.platform_admin_changes(created_at desc);

alter table public.platform_admin_changes enable row level security;
revoke all on table public.platform_admin_changes from anon, authenticated;
grant select, insert on table public.platform_admin_changes to service_role;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = auth.uid()
        and pa.active = true
    );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.platform_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.active = true
  ) then
    raise exception 'Acesso restrito ao administrador da plataforma.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'summary',
    jsonb_build_object(
      'clients',
        (select count(*)::integer from public.organizations o where o.status = 'active'),
      'paid_clients',
        (select count(*)::integer
         from public.organization_subscriptions os
         where os.plan_code <> 'GRATUITO' and os.status in ('active','trialing')),
      'free_clients',
        (select count(*)::integer
         from public.organization_subscriptions os
         where os.plan_code = 'GRATUITO' and os.status in ('active','trialing')),
      'people',
        (select count(*)::integer from public.people p where p.record_status = 'active'),
      'contracted_mrr_cents',
        (select coalesce(sum(sp.price_cents), 0)::bigint
         from public.organization_subscriptions os
         join public.subscription_plans sp on sp.code = os.plan_code
         where os.status in ('active','trialing')
           and coalesce(sp.billing_interval, 'month') = 'month'
           and sp.code <> 'GRATUITO'),
      'projected_arr_cents',
        (select (coalesce(sum(sp.price_cents), 0) * 12)::bigint
         from public.organization_subscriptions os
         join public.subscription_plans sp on sp.code = os.plan_code
         where os.status in ('active','trialing')
           and coalesce(sp.billing_interval, 'month') = 'month'
           and sp.code <> 'GRATUITO'),
      'collected_month_cents',
        (select coalesce(sum(pp.amount_cents), 0)::bigint
         from public.platform_payments pp
         where lower(pp.status) in ('approved','paid','authorized')
           and pp.paid_at >= date_trunc('month', now())),
      'collected_total_cents',
        (select coalesce(sum(pp.amount_cents), 0)::bigint
         from public.platform_payments pp
         where lower(pp.status) in ('approved','paid','authorized'))
    ),
    'paid_plan',
      (select jsonb_build_object(
        'code', sp.code,
        'name', sp.name,
        'price_cents', sp.price_cents,
        'currency', sp.currency,
        'billing_interval', sp.billing_interval,
        'trial_days', sp.trial_days,
        'grace_period_days', sp.grace_period_days
      )
       from public.subscription_plans sp where sp.code = 'ELO_IGREJA'),
    'free_plan',
      (select jsonb_build_object('code', sp.code, 'name', sp.name, 'limits', sp.limits)
       from public.subscription_plans sp where sp.code = 'GRATUITO'),
    'clients',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'name', q.name,
            'city', q.city,
            'state', q.state,
            'status', q.status,
            'created_at', q.created_at,
            'plan_code', q.plan_code,
            'plan_name', q.plan_name,
            'subscription_status', q.subscription_status,
            'current_period_end', q.current_period_end,
            'people_count', q.people_count,
            'contact_name', q.contact_name,
            'contact_email', q.contact_email,
            'contact_phone', q.contact_phone
          )
          order by q.created_at desc
        )
        from (
          select
            o.id,
            o.name,
            o.city,
            o.state,
            o.status,
            o.created_at,
            coalesce(os.plan_code, 'GRATUITO') as plan_code,
            coalesce(sp.name, 'Elo Livre') as plan_name,
            coalesce(os.status, 'active') as subscription_status,
            os.current_period_end,
            (select count(*)::integer
             from public.people p
             where p.organization_id = o.id and p.record_status = 'active') as people_count,
            (select p.full_name
             from public.people p
             where p.organization_id = o.id and p.auth_user_id = o.created_by
             order by p.created_at limit 1) as contact_name,
            (select p.email
             from public.people p
             where p.organization_id = o.id and p.auth_user_id = o.created_by
             order by p.created_at limit 1) as contact_email,
            (select p.phone
             from public.people p
             where p.organization_id = o.id and p.auth_user_id = o.created_by
             order by p.created_at limit 1) as contact_phone
          from public.organizations o
          left join public.organization_subscriptions os on os.organization_id = o.id
          left join public.subscription_plans sp on sp.code = os.plan_code
        ) q
      ), '[]'::jsonb),
    'recent_payments',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'organization_id', p.organization_id,
            'organization_name', o.name,
            'provider', p.provider,
            'status', p.status,
            'amount_cents', p.amount_cents,
            'currency', p.currency,
            'paid_at', p.paid_at,
            'created_at', p.created_at
          )
          order by p.created_at desc
        )
        from (
          select * from public.platform_payments order by created_at desc limit 30
        ) p
        join public.organizations o on o.id = p.organization_id
      ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_admin_dashboard() from public, anon;
grant execute on function public.platform_admin_dashboard() to authenticated;

create or replace function public.platform_admin_update_billing(
  p_price_cents integer,
  p_trial_days integer,
  p_grace_period_days integer,
  p_free_units_limit integer,
  p_free_people_limit integer,
  p_free_management_users_limit integer,
  p_free_departments_limit integer,
  p_free_active_series_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_previous jsonb;
  v_next jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid() and pa.active = true
  ) then
    raise exception 'Acesso restrito ao administrador da plataforma.'
      using errcode = '42501';
  end if;

  if p_price_cents < 1000 or p_price_cents > 100000 then
    raise exception 'O valor mensal deve ficar entre R$ 10,00 e R$ 1.000,00.';
  end if;
  if p_trial_days < 0 or p_trial_days > 90 then
    raise exception 'O teste gratuito deve ficar entre 0 e 90 dias.';
  end if;
  if p_grace_period_days < 0 or p_grace_period_days > 30 then
    raise exception 'A tolerância deve ficar entre 0 e 30 dias.';
  end if;
  if p_free_units_limit < 1
     or p_free_people_limit < 1
     or p_free_management_users_limit < 1
     or p_free_departments_limit < 0
     or p_free_active_series_limit < 0 then
    raise exception 'Os limites do plano gratuito são inválidos.';
  end if;

  select jsonb_build_object(
    'paid_plan', (select to_jsonb(sp) from public.subscription_plans sp where sp.code = 'ELO_IGREJA'),
    'free_plan', (select to_jsonb(sp) from public.subscription_plans sp where sp.code = 'GRATUITO')
  ) into v_previous;

  update public.subscription_plans
  set price_cents = p_price_cents,
      trial_days = p_trial_days,
      grace_period_days = p_grace_period_days,
      updated_by = auth.uid(),
      updated_at = now()
  where code = 'ELO_IGREJA';

  update public.subscription_plans
  set limits = jsonb_build_object(
        'units', p_free_units_limit,
        'people', p_free_people_limit,
        'management_users', p_free_management_users_limit,
        'departments', p_free_departments_limit,
        'active_service_series', p_free_active_series_limit
      ),
      updated_by = auth.uid(),
      updated_at = now()
  where code = 'GRATUITO';

  select jsonb_build_object(
    'paid_plan', (select to_jsonb(sp) from public.subscription_plans sp where sp.code = 'ELO_IGREJA'),
    'free_plan', (select to_jsonb(sp) from public.subscription_plans sp where sp.code = 'GRATUITO')
  ) into v_next;

  insert into public.platform_admin_changes(
    admin_user_id, change_type, previous_value, new_value
  )
  values (
    auth.uid(), 'billing_settings_updated', v_previous, v_next
  );

  return public.platform_admin_dashboard();
end;
$$;

revoke all on function public.platform_admin_update_billing(integer,integer,integer,integer,integer,integer,integer,integer)
  from public, anon;
grant execute on function public.platform_admin_update_billing(integer,integer,integer,integer,integer,integer,integer,integer)
  to authenticated;
