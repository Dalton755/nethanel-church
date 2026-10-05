-- Nethanel Elo v47
-- Checkout recorrente Mercado Pago com sessão própria, webhook idempotente e ativação segura.

create table if not exists public.platform_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.subscription_plans(code),
  requested_by uuid not null references auth.users(id) on delete restrict,
  payer_email text not null,
  provider text not null default 'mercado_pago',
  provider_subscription_id text,
  status text not null default 'created' check (status in ('created','pending','authorized','failed','canceled','expired')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL',
  checkout_url text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_checkout_sessions_org_idx
  on public.platform_checkout_sessions(organization_id, created_at desc);
create unique index if not exists platform_checkout_sessions_provider_subscription_uidx
  on public.platform_checkout_sessions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

alter table public.platform_checkout_sessions enable row level security;
revoke all on table public.platform_checkout_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_checkout_sessions to service_role;

alter table public.platform_payments
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists provider_subscription_id text;

create table if not exists public.platform_webhook_events (
  provider text not null,
  event_key text not null,
  event_type text not null,
  resource_id text,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_key)
);

alter table public.platform_webhook_events enable row level security;
revoke all on table public.platform_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_webhook_events to service_role;

create or replace function public.billing_prepare_checkout(
  p_organization_id uuid,
  p_plan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_email text;
  v_session_id uuid;
  v_current public.organization_subscriptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not app_private.has_permission(p_organization_id, 'billing.manage', null)
     and not app_private.has_permission(p_organization_id, 'organization.manage', null) then
    raise exception 'Somente a administração da igreja pode contratar ou alterar o plano.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.platform_church_blessings b
    where b.organization_id = p_organization_id and b.active = true
  ) then
    raise exception 'Esta igreja está com Elo Abençoar ativo e não precisa contratar um plano.';
  end if;

  if p_plan_code not in ('ELO_ESSENCIAL','ELO_CRESCIMENTO','ELO_COMPLETO','ELO_WHITE_LABEL') then
    raise exception 'Plano indisponível para contratação automática.';
  end if;

  select * into v_plan
  from public.subscription_plans sp
  where sp.code = p_plan_code
    and sp.active = true
    and sp.public_visible = true
    and sp.price_cents is not null
    and sp.price_cents > 0;

  if not found then
    raise exception 'Plano não encontrado ou indisponível.';
  end if;

  select * into v_current
  from public.organization_subscriptions os
  where os.organization_id = p_organization_id;

  if v_current.provider = 'mercado_pago'
     and v_current.status = 'active'
     and v_current.provider_subscription_id is not null then
    if v_current.plan_code = p_plan_code then
      return jsonb_build_object(
        'already_active', true,
        'organization_id', p_organization_id,
        'plan_code', v_current.plan_code,
        'provider_subscription_id', v_current.provider_subscription_id
      );
    end if;

    raise exception 'Cancele ou altere a assinatura atual antes de contratar outro plano.';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = auth.uid();

  if nullif(trim(coalesce(v_email,'')), '') is null then
    raise exception 'Sua conta precisa ter um e-mail para iniciar a assinatura.';
  end if;

  insert into public.platform_checkout_sessions(
    organization_id, plan_code, requested_by, payer_email,
    provider, status, amount_cents, currency
  ) values (
    p_organization_id, v_plan.code, auth.uid(), v_email,
    'mercado_pago', 'created', v_plan.price_cents, coalesce(v_plan.currency,'BRL')
  ) returning id into v_session_id;

  return jsonb_build_object(
    'already_active', false,
    'checkout_session_id', v_session_id,
    'organization_id', p_organization_id,
    'plan_code', v_plan.code,
    'plan_name', v_plan.name,
    'amount_cents', v_plan.price_cents,
    'currency', coalesce(v_plan.currency,'BRL'),
    'payer_email', v_email
  );
end;
$$;

revoke all on function public.billing_prepare_checkout(uuid,text) from public, anon;
grant execute on function public.billing_prepare_checkout(uuid,text) to authenticated;

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
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_row
  from public.platform_checkout_sessions pcs
  where pcs.id = p_checkout_session_id
    and pcs.requested_by = auth.uid()
  for update;

  if not found then
    raise exception 'Sessão de checkout não encontrada.' using errcode = '42501';
  end if;

  if not app_private.has_permission(v_row.organization_id, 'billing.manage', null)
     and not app_private.has_permission(v_row.organization_id, 'organization.manage', null) then
    raise exception 'Acesso negado.' using errcode = '42501';
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

revoke all on function public.billing_attach_provider_subscription(uuid,text,text,jsonb) from public, anon;
grant execute on function public.billing_attach_provider_subscription(uuid,text,text,jsonb) to authenticated;

create or replace function public.billing_get_cancel_context(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub public.organization_subscriptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if not app_private.has_permission(p_organization_id, 'billing.manage', null)
     and not app_private.has_permission(p_organization_id, 'organization.manage', null) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select * into v_sub from public.organization_subscriptions os
  where os.organization_id=p_organization_id;

  if v_sub.provider <> 'mercado_pago' or v_sub.provider_subscription_id is null or v_sub.status <> 'active' then
    raise exception 'Não existe assinatura ativa do Mercado Pago para cancelar.';
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'plan_code', v_sub.plan_code,
    'provider_subscription_id', v_sub.provider_subscription_id
  );
end;
$$;

revoke all on function public.billing_get_cancel_context(uuid) from public, anon;
grant execute on function public.billing_get_cancel_context(uuid) to authenticated;

create or replace function public.platform_apply_mercado_pago_subscription(
  p_provider_subscription_id text,
  p_external_reference text,
  p_provider_status text,
  p_next_payment_date timestamptz default null,
  p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.platform_checkout_sessions%rowtype;
  v_local_status text;
  v_period_end timestamptz;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select * into v_session
  from public.platform_checkout_sessions pcs
  where (pcs.provider='mercado_pago' and pcs.provider_subscription_id=p_provider_subscription_id)
     or (pcs.id::text=p_external_reference)
  order by case when pcs.provider_subscription_id=p_provider_subscription_id then 0 else 1 end, pcs.created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok',false,'ignored',true,'reason','checkout_session_not_found');
  end if;

  v_local_status := case lower(coalesce(p_provider_status,''))
    when 'authorized' then 'active'
    when 'pending' then 'pending'
    when 'paused' then 'past_due'
    when 'cancelled' then 'canceled'
    when 'canceled' then 'canceled'
    else 'pending'
  end;

  update public.platform_checkout_sessions
  set provider_subscription_id=coalesce(nullif(trim(p_provider_subscription_id),''),provider_subscription_id),
      provider_payload=coalesce(p_provider_payload,'{}'::jsonb),
      status=case
        when v_local_status='active' then 'authorized'
        when v_local_status='canceled' then 'canceled'
        else 'pending'
      end,
      updated_at=now()
  where id=v_session.id;

  if v_local_status='active' then
    v_period_end := coalesce(p_next_payment_date, now() + interval '1 month');

    insert into public.organization_subscriptions(
      organization_id,plan_code,status,provider,provider_subscription_id,current_period_end,created_at,updated_at
    ) values (
      v_session.organization_id,v_session.plan_code,'active','mercado_pago',p_provider_subscription_id,v_period_end,now(),now()
    )
    on conflict (organization_id) do update
    set plan_code=excluded.plan_code,
        status='active',
        provider='mercado_pago',
        provider_subscription_id=excluded.provider_subscription_id,
        current_period_end=excluded.current_period_end,
        updated_at=now();
  elsif v_local_status in ('canceled','past_due') then
    update public.organization_subscriptions
    set status=v_local_status,
        current_period_end=coalesce(current_period_end,p_next_payment_date),
        updated_at=now()
    where organization_id=v_session.organization_id
      and provider='mercado_pago'
      and provider_subscription_id=p_provider_subscription_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'organization_id',v_session.organization_id,
    'plan_code',v_session.plan_code,
    'subscription_status',v_local_status
  );
end;
$$;

revoke all on function public.platform_apply_mercado_pago_subscription(text,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.platform_apply_mercado_pago_subscription(text,text,text,timestamptz,jsonb) to service_role;

create or replace function public.platform_record_mercado_pago_payment(
  p_provider_payment_id text,
  p_external_reference text,
  p_status text,
  p_amount_cents integer,
  p_currency text,
  p_paid_at timestamptz default null,
  p_provider_subscription_id text default null,
  p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.platform_checkout_sessions%rowtype;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select * into v_session
  from public.platform_checkout_sessions pcs
  where pcs.id::text=p_external_reference
     or (p_provider_subscription_id is not null and pcs.provider_subscription_id=p_provider_subscription_id)
  order by pcs.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'ignored',true,'reason','checkout_session_not_found');
  end if;

  if p_amount_cents is null or p_amount_cents <> v_session.amount_cents
     or upper(coalesce(p_currency,'')) <> upper(v_session.currency) then
    return jsonb_build_object('ok',false,'ignored',true,'reason','amount_or_currency_mismatch');
  end if;

  insert into public.platform_payments(
    organization_id,plan_code,provider,provider_payment_id,status,amount_cents,currency,
    paid_at,provider_subscription_id,provider_payload,created_at,updated_at
  ) values (
    v_session.organization_id,v_session.plan_code,'mercado_pago',p_provider_payment_id,
    lower(coalesce(p_status,'unknown')),p_amount_cents,upper(p_currency),
    case when lower(coalesce(p_status,'')) in ('approved','paid','authorized') then coalesce(p_paid_at,now()) else p_paid_at end,
    p_provider_subscription_id,coalesce(p_provider_payload,'{}'::jsonb),now(),now()
  )
  on conflict (provider,provider_payment_id) do update
  set status=excluded.status,
      amount_cents=excluded.amount_cents,
      currency=excluded.currency,
      paid_at=coalesce(excluded.paid_at,public.platform_payments.paid_at),
      provider_subscription_id=coalesce(excluded.provider_subscription_id,public.platform_payments.provider_subscription_id),
      provider_payload=excluded.provider_payload,
      updated_at=now();

  return jsonb_build_object('ok',true,'organization_id',v_session.organization_id,'plan_code',v_session.plan_code);
end;
$$;

revoke all on function public.platform_record_mercado_pago_payment(text,text,text,integer,text,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.platform_record_mercado_pago_payment(text,text,text,integer,text,timestamptz,text,jsonb) to service_role;
