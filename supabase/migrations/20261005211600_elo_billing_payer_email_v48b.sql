create or replace function public.billing_prepare_checkout_v2(
  p_organization_id uuid,
  p_plan_code text,
  p_payer_email text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_login_email text;
  v_email text;
  v_session_id uuid;
  v_current public.organization_subscriptions%rowtype;
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

  select * into v_current
  from public.organization_subscriptions os
  where os.organization_id=p_organization_id;

  if v_current.provider='mercado_pago'
     and v_current.status='active'
     and v_current.provider_subscription_id is not null then
    if v_current.plan_code=p_plan_code then
      return jsonb_build_object(
        'already_active',true,
        'organization_id',p_organization_id,
        'plan_code',v_current.plan_code,
        'provider_subscription_id',v_current.provider_subscription_id
      );
    end if;

    raise exception 'Cancele ou altere a assinatura atual antes de contratar outro plano.';
  end if;

  select u.email into v_login_email
  from auth.users u
  where u.id=auth.uid();

  v_email := nullif(lower(trim(coalesce(p_payer_email,''))), '');

  if v_email is null then
    select nullif(lower(trim(coalesce(bp.email,''))), '')
      into v_email
    from public.billing_payers bp
    where bp.organization_id=p_organization_id;
  end if;

  v_email := coalesce(v_email, nullif(lower(trim(coalesce(v_login_email,''))), ''));

  if v_email is null then
    raise exception 'Informe um e-mail de cobrança para continuar.';
  end if;

  if v_email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' then
    raise exception 'Informe um e-mail de cobrança válido.';
  end if;

  insert into public.platform_checkout_sessions(
    organization_id,plan_code,requested_by,payer_email,
    provider,status,amount_cents,currency
  ) values (
    p_organization_id,v_plan.code,auth.uid(),v_email,
    'mercado_pago','created',v_plan.price_cents,coalesce(v_plan.currency,'BRL')
  ) returning id into v_session_id;

  return jsonb_build_object(
    'already_active',false,
    'checkout_session_id',v_session_id,
    'organization_id',p_organization_id,
    'plan_code',v_plan.code,
    'plan_name',v_plan.name,
    'amount_cents',v_plan.price_cents,
    'currency',coalesce(v_plan.currency,'BRL'),
    'payer_email',v_email
  );
end;
$$;

grant execute on function public.billing_prepare_checkout_v2(uuid,text,text) to authenticated;
