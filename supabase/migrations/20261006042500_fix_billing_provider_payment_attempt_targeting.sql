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
as $function$
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
  v_target_attempt_id uuid;
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
    v_target_attempt_id := v_attempt.id;
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

  if v_target_attempt_id is null then
    select bpa.id into v_target_attempt_id
    from public.billing_payment_attempts bpa
    where bpa.invoice_id=v_invoice.id
      and bpa.provider=lower(p_provider)
      and (
        (nullif(trim(coalesce(p_provider_authorization_id,'')),'') is not null and bpa.provider_authorization_id=p_provider_authorization_id)
        or (bpa.provider_payment_id is null and bpa.status not in ('received','confirmed','paid','approved'))
      )
    order by
      case when bpa.provider_authorization_id=p_provider_authorization_id then 0 else 1 end,
      bpa.created_at desc
    limit 1;
  end if;

  if v_target_attempt_id is not null then
    update public.billing_payment_attempts
    set status=v_status,
        provider_payment_id=coalesce(nullif(trim(p_provider_payment_id),''),provider_payment_id),
        provider_authorization_id=coalesce(nullif(trim(p_provider_authorization_id),''),provider_authorization_id),
        provider_subscription_id=coalesce(nullif(trim(p_provider_subscription_id),''),provider_subscription_id),
        provider_payload=coalesce(p_provider_payload,'{}'::jsonb),
        updated_at=now()
    where id=v_target_attempt_id;
  end if;

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
$function$;
