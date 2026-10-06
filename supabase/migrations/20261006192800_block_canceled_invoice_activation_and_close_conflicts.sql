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
  v_invoice_status text;
  v_result jsonb;
  v_org uuid;
  v_plan text;
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

  if v_invoice_id is null and nullif(trim(coalesce(p_external_reference,'')),'') is not null then
    begin
      v_invoice_id := p_external_reference::uuid;
    exception when others then
      v_invoice_id := null;
    end;
  end if;

  if v_invoice_id is not null then
    select bi.billing_environment, bi.status
      into v_target_env, v_invoice_status
      from public.billing_invoices bi
     where bi.id=v_invoice_id;

    if lower(coalesce(v_invoice_status,'')) in ('canceled','cancelled') then
      return jsonb_build_object('ok',false,'ignored',true,'reason','invoice_canceled','invoice_id',v_invoice_id);
    end if;
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

  v_result := public.billing_apply_provider_payment(
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

  if coalesce((v_result->>'paid')::boolean,false) and not coalesce((v_result->>'ignored')::boolean,false) then
    begin
      v_org := (v_result->>'organization_id')::uuid;
    exception when others then v_org := null; end;
    v_plan := v_result->>'plan_code';

    if v_org is not null and nullif(v_plan,'') is not null then
      update public.billing_invoices
         set status='canceled', updated_at=now()
       where organization_id=v_org
         and billing_environment=v_env
         and status='pending'
         and plan_code<>v_plan;

      update public.billing_payment_attempts bpa
         set status='canceled', updated_at=now()
       where bpa.invoice_id in (
         select bi.id from public.billing_invoices bi
          where bi.organization_id=v_org
            and bi.billing_environment=v_env
            and bi.status='canceled'
            and bi.plan_code<>v_plan
       )
         and bpa.status in ('created','pending','active');
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.billing_apply_provider_payment_secure(text,text,text,text,integer,text,timestamptz,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.billing_apply_provider_payment_secure(text,text,text,text,integer,text,timestamptz,text,text,jsonb,text) to postgres, service_role;