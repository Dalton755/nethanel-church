-- Nethanel Elo v44
-- Cortesia social ("Abençoar") para igrejas com acesso integral gratuito.

create table if not exists public.platform_church_blessings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  active boolean not null default true,
  reason text,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.platform_church_blessings enable row level security;
revoke all on table public.platform_church_blessings from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_church_blessings to service_role;

drop policy if exists platform_church_blessings_no_direct_access on public.platform_church_blessings;
create policy platform_church_blessings_no_direct_access
on public.platform_church_blessings
for all
to authenticated
using (false)
with check (false);

create index if not exists platform_church_blessings_active_idx
  on public.platform_church_blessings(active)
  where active = true;

create or replace function public.organization_has_full_access(p_organization_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    return false;
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
    return false;
  end if;

  return
    exists (
      select 1
      from public.platform_church_blessings b
      where b.organization_id = p_organization_id
        and b.active = true
    )
    or exists (
      select 1
      from public.organization_subscriptions os
      where os.organization_id = p_organization_id
        and os.plan_code = 'ELO_IGREJA'
        and os.status = 'active'
    );
end;
$$;

revoke all on function public.organization_has_full_access(uuid) from public, anon;
grant execute on function public.organization_has_full_access(uuid) to authenticated;

create or replace function public.platform_admin_set_church_blessing(
  p_organization_id uuid,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_previous jsonb;
  v_next jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
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

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.status <> 'archived'
  ) then
    raise exception 'Igreja não encontrada.';
  end if;

  select to_jsonb(b)
  into v_previous
  from public.platform_church_blessings b
  where b.organization_id = p_organization_id;

  insert into public.platform_church_blessings(
    organization_id,
    active,
    reason,
    granted_by,
    granted_at,
    revoked_at,
    updated_at
  ) values (
    p_organization_id,
    p_active,
    v_reason,
    auth.uid(),
    now(),
    case when p_active then null else now() end,
    now()
  )
  on conflict (organization_id) do update
  set active = excluded.active,
      reason = case
        when excluded.active then coalesce(excluded.reason, public.platform_church_blessings.reason)
        else public.platform_church_blessings.reason
      end,
      granted_by = case
        when excluded.active then auth.uid()
        else public.platform_church_blessings.granted_by
      end,
      granted_at = case
        when excluded.active then now()
        else public.platform_church_blessings.granted_at
      end,
      revoked_at = case when excluded.active then null else now() end,
      updated_at = now();

  select to_jsonb(b)
  into v_next
  from public.platform_church_blessings b
  where b.organization_id = p_organization_id;

  insert into public.platform_admin_changes(
    admin_user_id,
    change_type,
    previous_value,
    new_value
  ) values (
    auth.uid(),
    case when p_active then 'church_blessing_granted' else 'church_blessing_revoked' end,
    v_previous,
    v_next
  );

  return public.platform_admin_dashboard();
end;
$$;

revoke all on function public.platform_admin_set_church_blessing(uuid, boolean, text) from public, anon;
grant execute on function public.platform_admin_set_church_blessing(uuid, boolean, text) to authenticated;

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
    'summary', jsonb_build_object(
      'clients', (select count(*)::integer from public.organizations o where o.status = 'active'),
      'paid_clients', (
        select count(*)::integer
        from public.organization_subscriptions os
        where os.plan_code <> 'GRATUITO'
          and os.status = 'active'
          and not exists (
            select 1
            from public.platform_church_blessings b
            where b.organization_id = os.organization_id
              and b.active = true
          )
      ),
      'free_clients', (
        select count(*)::integer
        from public.organization_subscriptions os
        where os.plan_code = 'GRATUITO'
          and os.status = 'active'
          and not exists (
            select 1
            from public.platform_church_blessings b
            where b.organization_id = os.organization_id
              and b.active = true
          )
      ),
      'blessed_clients', (
        select count(*)::integer
        from public.platform_church_blessings b
        join public.organizations o on o.id = b.organization_id
        where b.active = true
          and o.status = 'active'
      ),
      'people', (
        select count(*)::integer
        from public.people p
        where p.record_status = 'active'
      ),
      'contracted_mrr_cents', (
        select coalesce(sum(sp.price_cents), 0)::bigint
        from public.organization_subscriptions os
        join public.subscription_plans sp on sp.code = os.plan_code
        where os.status = 'active'
          and coalesce(sp.billing_interval, 'month') = 'month'
          and sp.code <> 'GRATUITO'
          and not exists (
            select 1
            from public.platform_church_blessings b
            where b.organization_id = os.organization_id
              and b.active = true
          )
      ),
      'projected_arr_cents', (
        select (coalesce(sum(sp.price_cents), 0) * 12)::bigint
        from public.organization_subscriptions os
        join public.subscription_plans sp on sp.code = os.plan_code
        where os.status = 'active'
          and coalesce(sp.billing_interval, 'month') = 'month'
          and sp.code <> 'GRATUITO'
          and not exists (
            select 1
            from public.platform_church_blessings b
            where b.organization_id = os.organization_id
              and b.active = true
          )
      ),
      'collected_month_cents', (
        select coalesce(sum(pp.amount_cents), 0)::bigint
        from public.platform_payments pp
        where lower(pp.status) in ('approved', 'paid', 'authorized')
          and pp.paid_at >= date_trunc('month', now())
      ),
      'collected_total_cents', (
        select coalesce(sum(pp.amount_cents), 0)::bigint
        from public.platform_payments pp
        where lower(pp.status) in ('approved', 'paid', 'authorized')
      )
    ),
    'paid_plan', (
      select jsonb_build_object(
        'code', sp.code,
        'name', sp.name,
        'price_cents', sp.price_cents,
        'currency', sp.currency,
        'billing_interval', sp.billing_interval,
        'trial_days', sp.trial_days,
        'grace_period_days', sp.grace_period_days
      )
      from public.subscription_plans sp
      where sp.code = 'ELO_IGREJA'
    ),
    'free_plan', (
      select jsonb_build_object(
        'code', sp.code,
        'name', sp.name,
        'limits', sp.limits
      )
      from public.subscription_plans sp
      where sp.code = 'GRATUITO'
    ),
    'clients', coalesce((
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
          'contact_phone', q.contact_phone,
          'is_blessed', q.is_blessed,
          'blessing_reason', q.blessing_reason,
          'blessed_at', q.blessed_at
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
          case
            when b.active = true then 'Elo Igreja • Abençoada'
            else coalesce(sp.name, 'Elo Livre')
          end as plan_name,
          coalesce(os.status, 'active') as subscription_status,
          os.current_period_end,
          (
            select count(*)::integer
            from public.people p
            where p.organization_id = o.id
              and p.record_status = 'active'
          ) as people_count,
          (
            select p.full_name
            from public.people p
            where p.organization_id = o.id
              and p.auth_user_id = o.created_by
            order by p.created_at
            limit 1
          ) as contact_name,
          (
            select p.email
            from public.people p
            where p.organization_id = o.id
              and p.auth_user_id = o.created_by
            order by p.created_at
            limit 1
          ) as contact_email,
          (
            select p.phone
            from public.people p
            where p.organization_id = o.id
              and p.auth_user_id = o.created_by
            order by p.created_at
            limit 1
          ) as contact_phone,
          coalesce(b.active, false) as is_blessed,
          b.reason as blessing_reason,
          b.granted_at as blessed_at
        from public.organizations o
        left join public.organization_subscriptions os
          on os.organization_id = o.id
        left join public.subscription_plans sp
          on sp.code = os.plan_code
        left join public.platform_church_blessings b
          on b.organization_id = o.id
      ) q
    ), '[]'::jsonb),
    'recent_payments', coalesce((
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
        select *
        from public.platform_payments
        order by created_at desc
        limit 30
      ) p
      join public.organizations o on o.id = p.organization_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_admin_dashboard() from public, anon;
grant execute on function public.platform_admin_dashboard() to authenticated;
