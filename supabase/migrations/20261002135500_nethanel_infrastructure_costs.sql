create table if not exists public.nethanel_infrastructure_costs (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  provider_name text not null,
  service_name text not null,
  plan_name text,
  billing_cycle text not null default 'MONTHLY'
    check (billing_cycle in ('MONTHLY','ANNUAL','USAGE','ONE_TIME','CUSTOM')),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  currency text not null default 'USD',
  amount_kind text not null default 'MANUAL'
    check (amount_kind in ('ACTUAL','ESTIMATED','BASE','MANUAL')),
  next_charge_date date,
  billing_day integer check (billing_day between 1 and 31),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','PAUSED','CANCELLED','UNKNOWN')),
  source text not null default 'MANUAL',
  source_detail text,
  active_projects integer check (active_projects is null or active_projects >= 0),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nethanel_infrastructure_costs enable row level security;

drop policy if exists nethanel_admin_all on public.nethanel_infrastructure_costs;
create policy nethanel_admin_all
  on public.nethanel_infrastructure_costs
  for all
  to authenticated
  using ((select private.nethanel_is_admin()))
  with check ((select private.nethanel_is_admin()));

revoke all on table public.nethanel_infrastructure_costs from anon;
grant select, insert, update, delete on table public.nethanel_infrastructure_costs to authenticated;

insert into public.nethanel_infrastructure_costs
(provider_key, provider_name, service_name, plan_name, billing_cycle, amount, currency, amount_kind, status, source, source_detail, active_projects, notes, metadata, last_checked_at)
values
(
  'supabase',
  'Supabase',
  'Banco de dados e infraestrutura',
  'Pro',
  'MONTHLY',
  75.00,
  'USD',
  'ESTIMATED',
  'ACTIVE',
  'SUPABASE_MANAGEMENT',
  'Plano e projetos verificados pela integração. Valor é estimativa mensal, pois a próxima fatura não é exposta pela integração de gerenciamento.',
  6,
  'Organização Dalton755''s Org. 6 projetos ativos e 1 inativo no momento da verificação.',
  '{"organization_id":"ytagaejssdadaqvomees","tier":"tier_pro","inactive_projects":1}'::jsonb,
  now()
),
(
  'chatgpt',
  'OpenAI',
  'ChatGPT',
  'Plus',
  'MONTHLY',
  20.00,
  'USD',
  'BASE',
  'ACTIVE',
  'OPENAI_OFFICIAL_INFO',
  'Valor-base oficial do ChatGPT Plus. A data exata da próxima cobrança da conta não é exposta por API pública documentada.',
  null,
  'A cobrança mensal recorre no mesmo dia do mês em que a assinatura foi feita. Consulte Settings > Account/Billing para a data e o recibo da conta.',
  '{"api_usage_separate":true}'::jsonb,
  now()
)
on conflict (provider_key) do update set
  provider_name=excluded.provider_name,
  service_name=excluded.service_name,
  plan_name=excluded.plan_name,
  billing_cycle=excluded.billing_cycle,
  amount=excluded.amount,
  currency=excluded.currency,
  amount_kind=excluded.amount_kind,
  status=excluded.status,
  source=excluded.source,
  source_detail=excluded.source_detail,
  active_projects=excluded.active_projects,
  notes=excluded.notes,
  metadata=excluded.metadata,
  last_checked_at=excluded.last_checked_at,
  updated_at=now();
