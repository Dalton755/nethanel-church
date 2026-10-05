-- Nethanel Elo v46b
-- Catálogo público de planos usando RLS, sem SECURITY DEFINER anônimo.

revoke insert, update, delete, truncate, references, trigger
on table public.subscription_plans
from anon;

grant select on table public.subscription_plans to anon;

drop policy if exists subscription_plans_select_public_catalog
on public.subscription_plans;

create policy subscription_plans_select_public_catalog
on public.subscription_plans
for select
to anon
using (active = true and public_visible = true);

create or replace function public.list_public_elo_plans()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code', sp.code,
      'name', sp.name,
      'description', sp.description,
      'price_cents', sp.price_cents,
      'currency', sp.currency,
      'billing_interval', sp.billing_interval,
      'trial_days', sp.trial_days,
      'limits', sp.limits,
      'features', sp.features,
      'recommended', sp.recommended
    ) order by sp.sort_order
  ), '[]'::jsonb)
  from public.subscription_plans sp
  where sp.active = true
    and sp.public_visible = true;
$$;

revoke all on function public.list_public_elo_plans() from public;
grant execute on function public.list_public_elo_plans() to anon, authenticated;
