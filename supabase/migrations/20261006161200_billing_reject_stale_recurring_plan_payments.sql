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
  v_auth_org uuid;
  v_auth_plan text;
  v_current_plan text;
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

  if nullif(trim(coalesce(p_provider_authorization_id,'')),'') is not null then
    select bra.billing_environment, bra.organization_id, bra.plan_code
      into v_target_env, v_auth_org, v_auth_plan
      from public.billing_recurring_authorizations bra
     where bra.provider=lower(p_provider)
       and bra.provider_authorization_id=p_provider_authorization_id
     order by bra.created_at desc
     limit 1;
  elsif nullif(trim(coalesce(p_provider_subscription_id,'')),'') is not null then
    select bra.billing_environment, bra.organization_id, bra.plan_code
      into v_target_env, v_auth_org, v_auth_plan
      from public.billing_recurring_authorizations bra
     where bra.provider=lower(p_provider)
       and bra.provider_subscription_id=p_provider_subscription_id
     order by bra.updated_at desc
     limit 1;
  end if;

  if v_target_env is not null and v_target_env <> v_env then
    return jsonb_build_object('ok',false,'ignored',true,'reason','billing_environment_mismatch','expected_environment',v_target_env,'received_environment',v_env);
  end if;

  if v_auth_org is not null and v_auth_plan is not null then
    select os.plan_code into v_current_plan
      from public.organization_subscriptions os
     where os.organization_id=v_auth_org
       and os.status='active'
       and coalesce(os.billing_environment,'production')=v_env;

    if v_current_plan is not null and v_current_plan <> v_auth_plan then
      return jsonb_build_object(
        'ok',false,
        'ignored',true,
        'reason','stale_recurring_plan',
        'recurring_plan',v_auth_plan,
        'current_plan',v_current_plan,
        'organization_id',v_auth_org
      );
    end if;
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

revoke all on function public.billing_apply_provider_payment_secure(text,text,text,text,integer,text,timestamptz,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.billing_apply_provider_payment_secure(text,text,text,text,integer,text,timestamptz,text,text,jsonb,text) to service_role, postgres;