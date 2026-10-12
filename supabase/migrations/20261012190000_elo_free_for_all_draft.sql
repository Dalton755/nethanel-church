-- DRAFT ONLY: Este arquivo NAO sera aplicado a producao sem aprovacao.
-- Libera recursos para todas as igrejas, sem cobrar por acesso.
-- Historico financeiro e assinaturas externas existentes sao preservados.
CREATE OR REPLACE FUNCTION public.get_organization_plan_context(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_effective_code := 'ELO_REDE';

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
    'is_trial',false,
    'is_grace_period',false,
    'renewal_canceled',v_canceled_access,
    'trial_ends_at',null,
    'access_ends_at',null,
    'subscription_status','free',
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
    'price_cents',0,
    'name','Nethanel Elo • Gratuito',
    'base_plan_name','Nethanel Elo • Gratuito',
    'limits',jsonb_build_object('units',null,'people',null),
    'features',sp.features,
    'usage',jsonb_build_object('people',v_people_count)
  ) into v_result
  from public.subscription_plans sp
  where sp.code=v_effective_code;

  return v_result;
end;
$function$;

create or replace function app_private.organization_effective_plan_code(p_organization_id uuid)
 returns text language sql stable security definer set search_path to ''
as $$
 select 'ELO_REDE'::text;
$$;

create or replace function app_private.organization_people_limit(p_organization_id uuid)
 returns integer language sql stable security definer set search_path to ''
as $$
 select null::integer;
$$;

create or replace function app_private.sync_organization_white_label_entitlement()
 returns trigger language plpgsql security definer set search_path to ''
as $$
begin
 update public.organizations o
 set white_label_enabled=true, updated_at=now()
 where o.id=coalesce(new.organization_id,old.organization_id);
 return coalesce(new,old);
end;
$$;

-- Igrejas novas também devem nascer com todas as identidades habilitadas.
alter table public.organizations alter column white_label_enabled set default true;

update public.organizations set white_label_enabled=true,
 updated_at=now() where white_label_enabled is distinct from true;

create or replace function public.list_public_elo_plans()
 returns jsonb language sql stable set search_path to ''
as $$
 select '[]'::jsonb;
$$;

-- Nao apagar tabelas historicas: pendencias ou subscricoes anteriores
-- podem precisar de estorno/cancelamento pelo provedor. Novos checkouts
-- comerciais devem ser desligados na liberacao da migracao (feature flag).
-- Bloqueia novas cobranças comerciais, inclusive se uma versão antiga
-- do APK ainda tentar iniciar uma assinatura. Webhooks de pagamentos
-- históricos e cancelamento continuam independentes e operacionais.
create or replace function public.billing_prepare_checkout(
 p_organization_id uuid,p_plan_code text
) returns jsonb language plpgsql security definer
set search_path to ''
as $$
begin
 raise exception 'Nethanel Elo agora é gratuito. Não há assinatura obrigatória.'
 using errcode='42501';
end;
$$;
create or replace function public.billing_prepare_checkout_v2(
 p_organization_id uuid,p_plan_code text,p_payer_email text default null
) returns jsonb language plpgsql security definer
set search_path to ''
as $$
begin
 raise exception 'Nethanel Elo agora é gratuito. Não há assinatura obrigatória.'
 using errcode='42501';
end;
$$;
create or replace function public.billing_prepare_invoice(
 p_organization_id uuid,p_plan_code text,p_payment_method text,
 p_provider text default 'asaas'
) returns jsonb language plpgsql security definer
set search_path to ''
as $$
begin
 raise exception 'Nethanel Elo agora é gratuito. Não há mensalidade de acesso.'
 using errcode='42501';
end;
$$;
create or replace function public.platform_admin_assign_plan(
 p_organization_id uuid,p_plan_code text
) returns jsonb language plpgsql security definer
set search_path to ''
as $$
begin
 raise exception 'Planos comerciais encerrados. Todas as igrejas têm acesso completo.'
 using errcode='42501';
end;
$$;

notify pgrst,'reload schema';
