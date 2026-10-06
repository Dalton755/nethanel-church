create table if not exists public.billing_organization_environments (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  environment text not null check (environment in ('sandbox','production')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_organization_environments enable row level security;
revoke all on public.billing_organization_environments from anon, authenticated;
grant select, insert, update, delete on public.billing_organization_environments to service_role;

create or replace function public.billing_environment_for_organization(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select boe.environment
       from public.billing_organization_environments boe
      where boe.organization_id = p_organization_id),
    'production'
  );
$$;

revoke all on function public.billing_environment_for_organization(uuid) from public;
grant execute on function public.billing_environment_for_organization(uuid) to service_role, postgres;

alter table public.billing_invoices add column if not exists billing_environment text;
alter table public.billing_payment_attempts add column if not exists billing_environment text;
alter table public.billing_recurring_authorizations add column if not exists billing_environment text;
alter table public.platform_payments add column if not exists billing_environment text;
alter table public.organization_subscriptions add column if not exists billing_environment text;
alter table public.platform_webhook_events add column if not exists billing_environment text;

update public.billing_invoices set billing_environment='production' where billing_environment is null;
update public.billing_payment_attempts set billing_environment='production' where billing_environment is null;
update public.billing_recurring_authorizations set billing_environment='production' where billing_environment is null;
update public.platform_payments set billing_environment='production' where billing_environment is null;
update public.organization_subscriptions set billing_environment='production' where billing_environment is null;
update public.platform_webhook_events set billing_environment='production' where billing_environment is null;

alter table public.billing_invoices alter column billing_environment set default 'production', alter column billing_environment set not null;
alter table public.billing_payment_attempts alter column billing_environment set default 'production', alter column billing_environment set not null;
alter table public.billing_recurring_authorizations alter column billing_environment set default 'production', alter column billing_environment set not null;
alter table public.platform_payments alter column billing_environment set default 'production', alter column billing_environment set not null;
alter table public.organization_subscriptions alter column billing_environment set default 'production', alter column billing_environment set not null;
alter table public.platform_webhook_events alter column billing_environment set default 'production', alter column billing_environment set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='billing_invoices_environment_check') then
    alter table public.billing_invoices add constraint billing_invoices_environment_check check (billing_environment in ('sandbox','production'));
  end if;
  if not exists (select 1 from pg_constraint where conname='billing_attempts_environment_check') then
    alter table public.billing_payment_attempts add constraint billing_attempts_environment_check check (billing_environment in ('sandbox','production'));
  end if;
  if not exists (select 1 from pg_constraint where conname='billing_recurring_environment_check') then
    alter table public.billing_recurring_authorizations add constraint billing_recurring_environment_check check (billing_environment in ('sandbox','production'));
  end if;
  if not exists (select 1 from pg_constraint where conname='platform_payments_environment_check') then
    alter table public.platform_payments add constraint platform_payments_environment_check check (billing_environment in ('sandbox','production'));
  end if;
  if not exists (select 1 from pg_constraint where conname='organization_subscriptions_environment_check') then
    alter table public.organization_subscriptions add constraint organization_subscriptions_environment_check check (billing_environment in ('sandbox','production'));
  end if;
  if not exists (select 1 from pg_constraint where conname='platform_webhook_events_environment_check') then
    alter table public.platform_webhook_events add constraint platform_webhook_events_environment_check check (billing_environment in ('sandbox','production'));
  end if;
end $$;

create or replace function public.billing_force_organization_environment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.billing_environment := public.billing_environment_for_organization(new.organization_id);
  return new;
end;
$$;

revoke all on function public.billing_force_organization_environment() from public;

drop trigger if exists billing_invoice_force_environment on public.billing_invoices;
create trigger billing_invoice_force_environment before insert or update of organization_id, billing_environment on public.billing_invoices for each row execute function public.billing_force_organization_environment();

drop trigger if exists billing_attempt_force_environment on public.billing_payment_attempts;
create trigger billing_attempt_force_environment before insert or update of organization_id, billing_environment on public.billing_payment_attempts for each row execute function public.billing_force_organization_environment();

drop trigger if exists billing_recurring_force_environment on public.billing_recurring_authorizations;
create trigger billing_recurring_force_environment before insert or update of organization_id, billing_environment on public.billing_recurring_authorizations for each row execute function public.billing_force_organization_environment();

drop trigger if exists platform_payment_force_environment on public.platform_payments;
create trigger platform_payment_force_environment before insert or update of organization_id, billing_environment on public.platform_payments for each row execute function public.billing_force_organization_environment();

drop trigger if exists organization_subscription_force_environment on public.organization_subscriptions;
create trigger organization_subscription_force_environment before insert or update of organization_id, billing_environment on public.organization_subscriptions for each row execute function public.billing_force_organization_environment();

create or replace function public.billing_apply_provider_payment_secure(
  p_provider text,
  p_provider_payment_id text,
  p_external_reference text,
  p_status text,
  p_amount_cents integer,
  p_currency text,
  p_paid_at timestamptz default null,
  p_provider_authorization_id text default null,
  p_provider_subscription_id text default null,
  p_provider_payload jsonb default '{}'::jsonb,
  p_billing_environment text default 'production'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_env text := lower(trim(coalesce(p_billing_environment,'')));
  v_target_env text;
  v_invoice_id uuid;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_env not in ('sandbox','production') then
    raise exception 'Invalid billing environment';
  end if;

  if nullif(trim(coalesce(p_provider_payment_id,'')),'') is not null then
    select bpa.billing_environment, bpa.invoice_id
      into v_target_env, v_invoice_id
      from public.billing_payment_attempts bpa
     where bpa.provider=lower(p_provider)
       and bpa.provider_payment_id=p_provider_payment_id
     order by bpa.created_at desc
     limit 1;
  end if;

  if v_target_env is null and nullif(trim(coalesce(p_external_reference,'')),'') is not null then
    begin
      v_invoice_id := p_external_reference::uuid;
      select bi.billing_environment into v_target_env
        from public.billing_invoices bi where bi.id=v_invoice_id;
    exception when others then
      v_invoice_id := null;
    end;
  end if;

  if v_target_env is null and nullif(trim(coalesce(p_provider_authorization_id,'')),'') is not null then
    select bra.billing_environment into v_target_env
      from public.billing_recurring_authorizations bra
     where bra.provider=lower(p_provider)
       and bra.provider_authorization_id=p_provider_authorization_id
     order by bra.created_at desc
     limit 1;
  end if;

  if v_target_env is null and nullif(trim(coalesce(p_provider_subscription_id,'')),'') is not null then
    select bra.billing_environment into v_target_env
      from public.billing_recurring_authorizations bra
     where bra.provider=lower(p_provider)
       and bra.provider_subscription_id=p_provider_subscription_id
     order by bra.updated_at desc
     limit 1;
  end if;

  if v_target_env is not null and v_target_env <> v_env then
    return jsonb_build_object('ok',false,'ignored',true,'reason','billing_environment_mismatch','expected_environment',v_target_env,'received_environment',v_env);
  end if;

  return public.billing_apply_provider_payment(
    p_provider,
    p_provider_payment_id,
    p_external_reference,
    p_status,
    p_amount_cents,
    p_currency,
    p_paid_at,
    p_provider_authorization_id,
    p_provider_subscription_id,
    p_provider_payload
  );
end;
$$;

revoke all on function public.billing_apply_provider_payment_secure(text,text,text,text,integer,text,timestamptz,text,text,jsonb,text) from public;
grant execute on function public.billing_apply_provider_payment_secure(text,text,text,text,integer,text,timestamptz,text,text,jsonb,text) to service_role, postgres;

create or replace function public.billing_apply_recurring_authorization_secure(
  p_provider text,
  p_provider_authorization_id text,
  p_status text,
  p_next_due_date date default null,
  p_provider_subscription_id text default null,
  p_provider_payload jsonb default '{}'::jsonb,
  p_billing_environment text default 'production'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_env text := lower(trim(coalesce(p_billing_environment,'')));
  v_target_env text;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if v_env not in ('sandbox','production') then
    raise exception 'Invalid billing environment';
  end if;

  select bra.billing_environment into v_target_env
    from public.billing_recurring_authorizations bra
   where bra.provider=lower(p_provider)
     and bra.provider_authorization_id=p_provider_authorization_id
   order by bra.created_at desc
   limit 1;

  if v_target_env is not null and v_target_env <> v_env then
    return jsonb_build_object('ok',false,'ignored',true,'reason','billing_environment_mismatch','expected_environment',v_target_env,'received_environment',v_env);
  end if;

  return public.billing_apply_recurring_authorization(
    p_provider,
    p_provider_authorization_id,
    p_status,
    p_next_due_date,
    p_provider_subscription_id,
    p_provider_payload
  );
end;
$$;

revoke all on function public.billing_apply_recurring_authorization_secure(text,text,text,date,text,jsonb,text) from public;
grant execute on function public.billing_apply_recurring_authorization_secure(text,text,text,date,text,jsonb,text) to service_role, postgres;