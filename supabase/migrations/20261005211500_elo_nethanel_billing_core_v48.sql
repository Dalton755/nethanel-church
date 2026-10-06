create table if not exists public.billing_payers (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  name text not null,
  cpf_cnpj text not null,
  email text,
  phone text,
  provider_customer_ids jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.subscription_plans(code),
  status text not null default 'pending' check (status in ('pending','paid','overdue','canceled','refunded','failed')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL',
  due_date date not null default current_date,
  coverage_months integer not null default 1 check (coverage_months > 0 and coverage_months <= 24),
  paid_at timestamptz,
  access_starts_at timestamptz,
  access_ends_at timestamptz,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_invoices_org_status_idx
  on public.billing_invoices(organization_id, status, created_at desc);

create table if not exists public.billing_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  payment_method text not null,
  status text not null default 'created',
  provider_customer_id text,
  provider_payment_id text,
  provider_authorization_id text,
  provider_subscription_id text,
  checkout_url text,
  pix_payload text,
  pix_expiration timestamptz,
  boleto_url text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_attempt_provider_payment_uidx
  on public.billing_payment_attempts(provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists billing_attempt_invoice_idx
  on public.billing_payment_attempts(invoice_id, created_at desc);

create table if not exists public.billing_recurring_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.subscription_plans(code),
  initial_invoice_id uuid references public.billing_invoices(id) on delete set null,
  provider text not null,
  authorization_type text not null default 'pix_automatic',
  provider_customer_id text,
  provider_authorization_id text not null,
  provider_subscription_id text,
  status text not null default 'created',
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL',
  frequency text not null default 'MONTHLY',
  next_due_date date,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_authorization_id)
);

create index if not exists billing_recurring_org_status_idx
  on public.billing_recurring_authorizations(organization_id, status, updated_at desc);

alter table public.billing_payers enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_payment_attempts enable row level security;
alter table public.billing_recurring_authorizations enable row level security;

revoke all on public.billing_payers from anon, authenticated;
revoke all on public.billing_invoices from anon, authenticated;
revoke all on public.billing_payment_attempts from anon, authenticated;
revoke all on public.billing_recurring_authorizations from anon, authenticated;

grant select, insert, update, delete on public.billing_payers to service_role;
grant select, insert, update, delete on public.billing_invoices to service_role;
grant select, insert, update, delete on public.billing_payment_attempts to service_role;
grant select, insert, update, delete on public.billing_recurring_authorizations to service_role;

create or replace function public.billing_save_payer_profile(
  p_organization_id uuid,
  p_name text,
  p_cpf_cnpj text,
  p_email text default null,
  p_phone text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_doc text;
  v_name text;
  v_email text;
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(p_organization_id, 'billing.manage', null)
     and not app_private.has_permission(p_organization_id, 'organization.manage', null) then
    raise exception 'Somente a administração da igreja pode alterar os dados de cobrança.' using errcode='42501';
  end if;

  v_name := nullif(trim(coalesce(p_name,'')), '');
  v_doc := regexp_replace(coalesce(p_cpf_cnpj,''), '[^0-9]', '', 'g');
  v_email := nullif(lower(trim(coalesce(p_email,''))), '');
  v_phone := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), '');

  if v_name is null then
    raise exception 'Informe o nome do pagador.';
  end if;

  if length(v_doc) not in (11,14) then
    raise exception 'Informe um CPF ou CNPJ válido para cobrança.';
  end if;

  insert into public.billing_payers(
    organization_id, name, cpf_cnpj, email, phone, updated_by, created_at, updated_at
  ) values (
    p_organization_id, v_name, v_doc, v_email, v_phone, auth.uid(), now(), now()
  )
  on conflict (organization_id) do update
  set name=excluded.name,
      cpf_cnpj=excluded.cpf_cnpj,
      email=excluded.email,
      phone=excluded.phone,
      updated_by=auth.uid(),
      updated_at=now();

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'name',v_name,
    'cpf_cnpj',v_doc,
    'email',v_email,
    'phone',v_phone
  );
end;
$$;

grant execute on function public.billing_save_payer_profile(uuid,text,text,text,text) to authenticated;

create or replace function public.billing_get_payment_context(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_payer jsonb;
  v_invoices jsonb;
  v_recurring jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(p_organization_id, 'billing.manage', null)
     and not app_private.has_permission(p_organization_id, 'organization.manage', null) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'name',bp.name,
    'cpf_cnpj',bp.cpf_cnpj,
    'email',bp.email,
    'phone',bp.phone
  ) into v_payer
  from public.billing_payers bp
  where bp.organization_id=p_organization_id;

  select coalesce(jsonb_agg(x.obj order by x.created_at desc), '[]'::jsonb)
  into v_invoices
  from (
    select bi.created_at,
      jsonb_build_object(
        'id',bi.id,
        'plan_code',bi.plan_code,
        'status',bi.status,
        'amount_cents',bi.amount_cents,
        'currency',bi.currency,
        'due_date',bi.due_date,
        'paid_at',bi.paid_at,
        'access_ends_at',bi.access_ends_at
      ) as obj
    from public.billing_invoices bi
    where bi.organization_id=p_organization_id
    order by bi.created_at desc
    limit 12
  ) x;

  select jsonb_build_object(
    'id',bra.id,
    'provider',bra.provider,
    'authorization_type',bra.authorization_type,
    'provider_authorization_id',bra.provider_authorization_id,
    'status',bra.status,
    'plan_code',bra.plan_code,
    'amount_cents',bra.amount_cents,
    'currency',bra.currency,
    'frequency',bra.frequency,
    'next_due_date',bra.next_due_date
  ) into v_recurring
  from public.billing_recurring_authorizations bra
  where bra.organization_id=p_organization_id
    and lower(bra.status) in ('created','pending','active')
  order by bra.updated_at desc
  limit 1;

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'payer',v_payer,
    'invoices',v_invoices,
    'recurring',v_recurring
  );
end;
$$;

grant execute on function public.billing_get_payment_context(uuid) to authenticated;

create or replace function public.billing_prepare_invoice(
  p_organization_id uuid,
  p_plan_code text,
  p_payment_method text,
  p_provider text default 'asaas'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_payer public.billing_payers%rowtype;
  v_invoice public.billing_invoices%rowtype;
  v_attempt_id uuid;
  v_method text := lower(trim(coalesce(p_payment_method,'')));
  v_provider text := lower(trim(coalesce(p_provider,'asaas')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(p_organization_id, 'billing.manage', null)
     and not app_private.has_permission(p_organization_id, 'organization.manage', null) then
    raise exception 'Somente a administração da igreja pode contratar ou alterar o plano.' using errcode='42501';
  end if;

  if exists (
    select 1 from public.platform_church_blessings b
    where b.organization_id=p_organization_id and b.active=true
  ) then
    raise exception 'Esta igreja está com Elo Abençoar ativo e não precisa contratar um plano.';
  end if;

  if p_plan_code not in ('ELO_ESSENCIAL','ELO_CRESCIMENTO','ELO_COMPLETO','ELO_WHITE_LABEL') then
    raise exception 'Plano indisponível para contratação automática.';
  end if;

  if v_provider <> 'asaas' then
    raise exception 'Provedor indisponível para este fluxo.';
  end if;

  if v_method not in ('pix','boleto','card','pix_automatic') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  select * into v_plan
  from public.subscription_plans sp
  where sp.code=p_plan_code
    and sp.active=true
    and sp.public_visible=true
    and sp.price_cents is not null
    and sp.price_cents>0;

  if not found then
    raise exception 'Plano não encontrado ou indisponível.';
  end if;

  select * into v_payer
  from public.billing_payers bp
  where bp.organization_id=p_organization_id;

  if not found then
    raise exception 'Cadastre os dados do pagador antes de continuar.';
  end if;

  if v_method='pix_automatic' and exists (
    select 1 from public.billing_recurring_authorizations bra
    where bra.organization_id=p_organization_id
      and lower(bra.status) in ('created','pending','active')
  ) then
    raise exception 'Já existe uma autorização recorrente em andamento para esta igreja.';
  end if;

  select * into v_invoice
  from public.billing_invoices bi
  where bi.organization_id=p_organization_id
    and bi.plan_code=v_plan.code
    and bi.status='pending'
    and bi.amount_cents=v_plan.price_cents
    and upper(bi.currency)=upper(coalesce(v_plan.currency,'BRL'))
    and bi.created_at > now() - interval '24 hours'
  order by bi.created_at desc
  limit 1;

  if not found then
    insert into public.billing_invoices(
      organization_id,plan_code,status,amount_cents,currency,due_date,coverage_months,created_by,metadata
    ) values (
      p_organization_id,v_plan.code,'pending',v_plan.price_cents,coalesce(v_plan.currency,'BRL'),current_date,1,auth.uid(),
      jsonb_build_object('source','nethanel_billing')
    ) returning * into v_invoice;
  end if;

  insert into public.billing_payment_attempts(
    invoice_id,organization_id,provider,payment_method,status,created_by
  ) values (
    v_invoice.id,p_organization_id,v_provider,v_method,'created',auth.uid()
  ) returning id into v_attempt_id;

  return jsonb_build_object(
    'invoice_id',v_invoice.id,
    'attempt_id',v_attempt_id,
    'organization_id',p_organization_id,
    'plan_code',v_plan.code,
    'plan_name',v_plan.name,
    'amount_cents',v_plan.price_cents,
    'currency',coalesce(v_plan.currency,'BRL'),
    'due_date',v_invoice.due_date,
    'payment_method',v_method,
    'provider',v_provider,
    'payer',jsonb_build_object(
      'name',v_payer.name,
      'cpf_cnpj',v_payer.cpf_cnpj,
      'email',v_payer.email,
      'phone',v_payer.phone,
      'provider_customer_ids',v_payer.provider_customer_ids
    )
  );
end;
$$;

grant execute on function public.billing_prepare_invoice(uuid,text,text,text) to authenticated;

create or replace function public.billing_register_provider_attempt(
  p_attempt_id uuid,
  p_provider_customer_id text default null,
  p_provider_payment_id text default null,
  p_provider_authorization_id text default null,
  p_provider_subscription_id text default null,
  p_status text default 'pending',
  p_checkout_url text default null,
  p_pix_payload text default null,
  p_pix_expiration timestamptz default null,
  p_boleto_url text default null,
  p_provider_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_attempt public.billing_payment_attempts%rowtype;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select * into v_attempt
  from public.billing_payment_attempts bpa
  where bpa.id=p_attempt_id
  for update;

  if not found then
    raise exception 'Tentativa de pagamento não encontrada.';
  end if;

  update public.billing_payment_attempts
  set provider_customer_id=coalesce(nullif(trim(p_provider_customer_id),''),provider_customer_id),
      provider_payment_id=coalesce(nullif(trim(p_provider_payment_id),''),provider_payment_id),
      provider_authorization_id=coalesce(nullif(trim(p_provider_authorization_id),''),provider_authorization_id),
      provider_subscription_id=coalesce(nullif(trim(p_provider_subscription_id),''),provider_subscription_id),
      status=coalesce(nullif(trim(p_status),''),status),
      checkout_url=coalesce(nullif(trim(p_checkout_url),''),checkout_url),
      pix_payload=coalesce(nullif(trim(p_pix_payload),''),pix_payload),
      pix_expiration=coalesce(p_pix_expiration,pix_expiration),
      boleto_url=coalesce(nullif(trim(p_boleto_url),''),boleto_url),
      provider_payload=coalesce(p_provider_payload,'{}'::jsonb),
      updated_at=now()
  where id=p_attempt_id;

  if v_attempt.provider='asaas' and p_provider_customer_id is not null then
    update public.billing_payers
    set provider_customer_ids=jsonb_set(coalesce(provider_customer_ids,'{}'::jsonb),'{asaas}',to_jsonb(p_provider_customer_id),true),
        updated_at=now()
    where organization_id=v_attempt.organization_id;
  end if;

  return jsonb_build_object('ok',true,'attempt_id',p_attempt_id);
end;
$$;

revoke all on function public.billing_register_provider_attempt(uuid,text,text,text,text,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.billing_register_provider_attempt(uuid,text,text,text,text,text,text,text,timestamptz,text,jsonb) to service_role;

create or replace function public.billing_register_recurring_authorization(
  p_attempt_id uuid,
  p_provider_authorization_id text,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_status text default 'created',
  p_provider_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_attempt public.billing_payment_attempts%rowtype;
  v_invoice public.billing_invoices%rowtype;
  v_id uuid;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;

  select * into v_attempt from public.billing_payment_attempts where id=p_attempt_id;
  if not found then raise exception 'Tentativa não encontrada.'; end if;

  select * into v_invoice from public.billing_invoices where id=v_attempt.invoice_id;
  if not found then raise exception 'Fatura não encontrada.'; end if;

  insert into public.billing_recurring_authorizations(
    organization_id,plan_code,initial_invoice_id,provider,authorization_type,
    provider_customer_id,provider_authorization_id,provider_subscription_id,status,
    amount_cents,currency,frequency,provider_payload,created_at,updated_at
  ) values (
    v_invoice.organization_id,v_invoice.plan_code,v_invoice.id,v_attempt.provider,'pix_automatic',
    p_provider_customer_id,p_provider_authorization_id,p_provider_subscription_id,lower(coalesce(p_status,'created')),
    v_invoice.amount_cents,v_invoice.currency,'MONTHLY',coalesce(p_provider_payload,'{}'::jsonb),now(),now()
  )
  on conflict (provider,provider_authorization_id) do update
  set provider_customer_id=coalesce(excluded.provider_customer_id,public.billing_recurring_authorizations.provider_customer_id),
      provider_subscription_id=coalesce(excluded.provider_subscription_id,public.billing_recurring_authorizations.provider_subscription_id),
      status=excluded.status,
      provider_payload=excluded.provider_payload,
      updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'authorization_id',v_id);
end;
$$;

revoke all on function public.billing_register_recurring_authorization(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.billing_register_recurring_authorization(uuid,text,text,text,text,jsonb) to service_role;

create or replace function public.billing_apply_recurring_authorization(
  p_provider text,
  p_provider_authorization_id text,
  p_status text,
  p_next_due_date date default null,
  p_provider_subscription_id text default null,
  p_provider_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.billing_recurring_authorizations%rowtype;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;

  update public.billing_recurring_authorizations
  set status=lower(coalesce(p_status,status)),
      next_due_date=coalesce(p_next_due_date,next_due_date),
      provider_subscription_id=coalesce(nullif(trim(p_provider_subscription_id),''),provider_subscription_id),
      provider_payload=coalesce(p_provider_payload,'{}'::jsonb),
      updated_at=now()
  where provider=lower(p_provider)
    and provider_authorization_id=p_provider_authorization_id
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok',false,'ignored',true,'reason','authorization_not_found');
  end if;

  return jsonb_build_object('ok',true,'organization_id',v_row.organization_id,'plan_code',v_row.plan_code,'status',v_row.status);
end;
$$;

revoke all on function public.billing_apply_recurring_authorization(text,text,text,date,text,jsonb) from public, anon, authenticated;
grant execute on function public.billing_apply_recurring_authorization(text,text,text,date,text,jsonb) to service_role;

create or replace function public.billing_apply_provider_payment(
  p_provider text,
  p_provider_payment_id text,
  p_external_reference text,
  p_status text,
  p_amount_cents integer,
  p_currency text,
  p_paid_at timestamptz default null,
  p_provider_authorization_id text default null,
  p_provider_subscription_id text default null,
  p_provider_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invoice public.billing_invoices%rowtype;
  v_attempt public.billing_payment_attempts%rowtype;
  v_auth public.billing_recurring_authorizations%rowtype;
  v_sub public.organization_subscriptions%rowtype;
  v_status text := lower(coalesce(p_status,'unknown'));
  v_paid boolean := false;
  v_transition_to_paid boolean := false;
  v_effective_paid_at timestamptz := coalesce(p_paid_at,now());
  v_access_start timestamptz;
  v_access_end timestamptz;
  v_invoice_id uuid;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;

  if nullif(trim(coalesce(p_provider_payment_id,'')),'') is not null then
    select * into v_attempt
    from public.billing_payment_attempts bpa
    where bpa.provider=lower(p_provider)
      and bpa.provider_payment_id=p_provider_payment_id
    order by bpa.created_at desc
    limit 1;
  end if;

  if found then
    v_invoice_id := v_attempt.invoice_id;
  elsif nullif(trim(coalesce(p_external_reference,'')),'') is not null then
    begin
      v_invoice_id := p_external_reference::uuid;
    exception when others then
      v_invoice_id := null;
    end;
  end if;

  if v_invoice_id is null and nullif(trim(coalesce(p_provider_authorization_id,'')),'') is not null then
    select * into v_auth
    from public.billing_recurring_authorizations bra
    where bra.provider=lower(p_provider)
      and bra.provider_authorization_id=p_provider_authorization_id
    order by bra.created_at desc
    limit 1;

    if found then
      if p_amount_cents <> v_auth.amount_cents
         or upper(coalesce(p_currency,'')) <> upper(v_auth.currency) then
        return jsonb_build_object('ok',false,'ignored',true,'reason','recurring_amount_or_currency_mismatch');
      end if;

      insert into public.billing_invoices(
        organization_id,plan_code,status,amount_cents,currency,due_date,coverage_months,created_by,metadata
      ) values (
        v_auth.organization_id,v_auth.plan_code,'pending',v_auth.amount_cents,v_auth.currency,current_date,1,null,
        jsonb_build_object('source','pix_automatic','provider_authorization_id',p_provider_authorization_id)
      ) returning id into v_invoice_id;
    end if;
  end if;

  if v_invoice_id is null then
    return jsonb_build_object('ok',false,'ignored',true,'reason','invoice_not_found');
  end if;

  select * into v_invoice
  from public.billing_invoices bi
  where bi.id=v_invoice_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'ignored',true,'reason','invoice_not_found');
  end if;

  if p_amount_cents is null or p_amount_cents <> v_invoice.amount_cents
     or upper(coalesce(p_currency,'')) <> upper(v_invoice.currency) then
    return jsonb_build_object('ok',false,'ignored',true,'reason','amount_or_currency_mismatch');
  end if;

  v_paid := v_status in ('received','confirmed','paid','approved','authorized');
  v_transition_to_paid := v_paid and v_invoice.status <> 'paid';

  insert into public.platform_payments(
    organization_id,plan_code,provider,provider_payment_id,status,amount_cents,currency,
    paid_at,provider_subscription_id,provider_payload,created_at,updated_at
  ) values (
    v_invoice.organization_id,v_invoice.plan_code,lower(p_provider),p_provider_payment_id,v_status,
    p_amount_cents,upper(p_currency),case when v_paid then v_effective_paid_at else p_paid_at end,
    coalesce(p_provider_subscription_id,p_provider_authorization_id),coalesce(p_provider_payload,'{}'::jsonb),now(),now()
  )
  on conflict (provider,provider_payment_id) do update
  set status=excluded.status,
      amount_cents=excluded.amount_cents,
      currency=excluded.currency,
      paid_at=coalesce(excluded.paid_at,public.platform_payments.paid_at),
      provider_subscription_id=coalesce(excluded.provider_subscription_id,public.platform_payments.provider_subscription_id),
      provider_payload=excluded.provider_payload,
      updated_at=now();

  update public.billing_payment_attempts
  set status=v_status,
      provider_payment_id=coalesce(nullif(trim(p_provider_payment_id),''),provider_payment_id),
      provider_authorization_id=coalesce(nullif(trim(p_provider_authorization_id),''),provider_authorization_id),
      provider_subscription_id=coalesce(nullif(trim(p_provider_subscription_id),''),provider_subscription_id),
      provider_payload=coalesce(p_provider_payload,'{}'::jsonb),
      updated_at=now()
  where invoice_id=v_invoice.id
    and provider=lower(p_provider)
    and (
      provider_payment_id=p_provider_payment_id
      or (provider_payment_id is null and provider_authorization_id=p_provider_authorization_id)
      or (provider_payment_id is null and provider_authorization_id is null)
    );

  if v_transition_to_paid then
    select * into v_sub
    from public.organization_subscriptions os
    where os.organization_id=v_invoice.organization_id
    for update;

    if found
       and v_sub.plan_code=v_invoice.plan_code
       and v_sub.current_period_end is not null
       and v_sub.current_period_end > v_effective_paid_at then
      v_access_start := v_sub.current_period_end;
    else
      v_access_start := v_effective_paid_at;
    end if;

    v_access_end := v_access_start + make_interval(months => v_invoice.coverage_months);

    update public.billing_invoices
    set status='paid',
        paid_at=v_effective_paid_at,
        access_starts_at=v_access_start,
        access_ends_at=v_access_end,
        updated_at=now()
    where id=v_invoice.id;

    insert into public.organization_subscriptions(
      organization_id,plan_code,status,provider,provider_subscription_id,current_period_end,created_at,updated_at
    ) values (
      v_invoice.organization_id,v_invoice.plan_code,'active','nethanel_billing',
      coalesce(p_provider_authorization_id,p_provider_subscription_id),v_access_end,now(),now()
    )
    on conflict (organization_id) do update
    set plan_code=excluded.plan_code,
        status='active',
        provider='nethanel_billing',
        provider_subscription_id=excluded.provider_subscription_id,
        current_period_end=excluded.current_period_end,
        updated_at=now();
  elsif not v_paid then
    update public.billing_invoices
    set status=case
      when v_status in ('overdue','past_due') then 'overdue'
      when v_status in ('refunded','chargeback') then 'refunded'
      when v_status in ('failed','refused','canceled','cancelled') then 'failed'
      else status
    end,
    updated_at=now()
    where id=v_invoice.id and status <> 'paid';
  end if;

  return jsonb_build_object(
    'ok',true,
    'organization_id',v_invoice.organization_id,
    'plan_code',v_invoice.plan_code,
    'invoice_id',v_invoice.id,
    'paid',v_paid,
    'access_ends_at',v_access_end
  );
end;
$$;

revoke all on function public.billing_apply_provider_payment(text,text,text,text,integer,text,timestamptz,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.billing_apply_provider_payment(text,text,text,text,integer,text,timestamptz,text,text,jsonb) to service_role;

create or replace function public.billing_get_cancel_context_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_sub public.organization_subscriptions%rowtype;
  v_auth public.billing_recurring_authorizations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(p_organization_id, 'billing.manage', null)
     and not app_private.has_permission(p_organization_id, 'organization.manage', null) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select * into v_sub from public.organization_subscriptions where organization_id=p_organization_id;
  if not found or v_sub.status <> 'active' then
    raise exception 'Não existe cobrança recorrente ativa para cancelar.';
  end if;

  if v_sub.provider='mercado_pago' and v_sub.provider_subscription_id is not null then
    return jsonb_build_object(
      'organization_id',p_organization_id,
      'plan_code',v_sub.plan_code,
      'provider','mercado_pago',
      'provider_subscription_id',v_sub.provider_subscription_id,
      'current_period_end',v_sub.current_period_end
    );
  end if;

  select * into v_auth
  from public.billing_recurring_authorizations
  where organization_id=p_organization_id
    and lower(status)='active'
  order by updated_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'organization_id',p_organization_id,
      'plan_code',v_sub.plan_code,
      'provider',v_auth.provider,
      'provider_authorization_id',v_auth.provider_authorization_id,
      'provider_subscription_id',v_auth.provider_subscription_id,
      'current_period_end',v_sub.current_period_end
    );
  end if;

  raise exception 'Não existe cobrança recorrente ativa para cancelar.';
end;
$$;

grant execute on function public.billing_get_cancel_context_v2(uuid) to authenticated;

create or replace function public.get_organization_plan_context(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
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
  v_paid_provider boolean := false;
  v_active_current boolean := false;
  v_display_status text;
  v_recurring_provider text;
  v_recurring_method text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select (
    exists (
      select 1 from public.platform_admins pa
      where pa.user_id=auth.uid() and pa.active=true
    )
    or exists (
      select 1
      from public.people p
      join public.organization_memberships om
        on om.organization_id=p.organization_id
       and om.person_id=p.id
       and om.status='active'
      where p.organization_id=p_organization_id
        and p.auth_user_id=auth.uid()
        and p.record_status='active'
    )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Insufficient organization access' using errcode='42501';
  end if;

  select exists (
    select 1 from public.platform_church_blessings b
    where b.organization_id=p_organization_id and b.active=true
  ) into v_blessed;

  select os.plan_code,os.status,os.provider,os.provider_subscription_id,os.current_period_end
  into v_billing_code,v_billing_status,v_provider,v_provider_subscription_id,v_period_end
  from public.organization_subscriptions os
  where os.organization_id=p_organization_id
  limit 1;

  v_billing_code := coalesce(v_billing_code,'GRATUITO');
  v_billing_status := coalesce(v_billing_status,'active');
  v_paid_provider := coalesce(v_provider,'') in ('mercado_pago','nethanel_billing','asaas');

  select coalesce(sp.grace_period_days,0)
  into v_grace_days
  from public.subscription_plans sp
  where sp.code=v_billing_code;
  v_grace_days := coalesce(v_grace_days,0);

  v_is_trial := (
    v_provider='internal_trial'
    and v_billing_status='pending'
    and v_period_end is not null
    and v_period_end>now()
  );

  v_active_current := (
    v_billing_status='active'
    and (
      not v_paid_provider
      or v_period_end is null
      or v_period_end>now()
    )
  );

  v_canceled_access := (
    v_paid_provider
    and v_billing_status='canceled'
    and v_period_end is not null
    and v_period_end>now()
  );

  v_in_grace := (
    v_paid_provider
    and v_billing_status in ('active','past_due')
    and v_period_end is not null
    and v_period_end<=now()
    and v_period_end + make_interval(days=>v_grace_days)>now()
  );

  v_display_status := case
    when v_in_grace then 'past_due'
    else v_billing_status
  end;

  v_effective_code := case
    when v_blessed then 'ELO_WHITE_LABEL'
    when v_active_current then v_billing_code
    when v_is_trial then v_billing_code
    when v_canceled_access then v_billing_code
    when v_in_grace then v_billing_code
    else 'GRATUITO'
  end;

  v_access_ends_at := case
    when v_is_trial then v_period_end
    when v_canceled_access then v_period_end
    when v_in_grace then v_period_end + make_interval(days=>v_grace_days)
    when v_active_current and v_paid_provider then v_period_end
    else null
  end;

  select bra.provider,bra.authorization_type
  into v_recurring_provider,v_recurring_method
  from public.billing_recurring_authorizations bra
  where bra.organization_id=p_organization_id
    and lower(bra.status)='active'
  order by bra.updated_at desc
  limit 1;

  select count(*)::integer into v_people_count
  from public.people p
  where p.organization_id=p_organization_id
    and p.record_status='active';

  select jsonb_build_object(
    'organization_id',p_organization_id,
    'is_blessed',v_blessed,
    'is_trial',v_is_trial,
    'is_grace_period',v_in_grace,
    'renewal_canceled',v_canceled_access,
    'trial_ends_at',case when v_is_trial then v_period_end else null end,
    'access_ends_at',v_access_ends_at,
    'subscription_status',v_display_status,
    'subscription_provider',v_provider,
    'current_period_end',v_period_end,
    'billing_recurring_provider',v_recurring_provider,
    'billing_recurring_method',v_recurring_method,
    'can_cancel_subscription',(
      not v_blessed
      and v_billing_status='active'
      and (
        (v_provider='mercado_pago' and v_provider_subscription_id is not null)
        or v_recurring_provider is not null
      )
    ),
    'billing_plan_code',v_billing_code,
    'effective_plan_code',v_effective_code,
    'price_cents',case when v_blessed or v_is_trial then 0 else sp.price_cents end,
    'name',case
      when v_blessed then 'Elo Abençoar'
      when v_is_trial then 'Teste Elo Completo'
      else sp.name
    end,
    'base_plan_name',sp.name,
    'limits',sp.limits,
    'features',sp.features,
    'usage',jsonb_build_object('people',v_people_count)
  ) into v_result
  from public.subscription_plans sp
  where sp.code=v_effective_code;

  return v_result;
end;
$$;

grant execute on function public.get_organization_plan_context(uuid) to authenticated;
