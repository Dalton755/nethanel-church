create schema if not exists private;
revoke all on schema private from public;

create or replace function private.nethanel_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = (select auth.uid())
        and pa.active = true
    );
$$;

revoke all on function private.nethanel_is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.nethanel_is_admin() to authenticated;

create table if not exists public.nethanel_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  status text not null default 'ATIVO'
    check (status in ('ATIVO','BETA','PAUSADO','DESCONTINUADO')),
  repo_full_name text,
  app_url text,
  source_project_ref text,
  source_schema text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nethanel_product_metrics (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.nethanel_products(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  users_total integer not null default 0,
  customers_total integer not null default 0,
  paying_customers integer not null default 0,
  trials_active integer not null default 0,
  subscriptions_active integer not null default 0,
  revenue_month numeric(14,2) not null default 0,
  revenue_total numeric(14,2) not null default 0,
  mrr numeric(14,2) not null default 0,
  churn_count integer not null default 0,
  extra jsonb not null default '{}'::jsonb
);

create index if not exists idx_nethanel_metrics_product_snapshot
  on public.nethanel_product_metrics(product_id, snapshot_at desc);

create table if not exists public.nethanel_product_plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.nethanel_products(id) on delete cascade,
  source_plan_key text,
  name text not null,
  billing_type text not null default 'MONTHLY'
    check (billing_type in ('FREE','MONTHLY','ANNUAL','ONE_TIME','CUSTOM')),
  price numeric(14,2) not null default 0,
  currency text not null default 'BRL',
  active boolean not null default true,
  trial_enabled boolean not null default false,
  trial_days integer not null default 0 check (trial_days >= 0),
  limits jsonb not null default '{}'::jsonb,
  external_provider_id text,
  notes text,
  updated_at timestamptz not null default now(),
  unique(product_id, source_plan_key)
);

create table if not exists public.nethanel_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  customer_type text not null default 'PESSOA'
    check (customer_type in ('PESSOA','IGREJA','EMPRESA')),
  status text not null default 'ATIVO'
    check (status in ('LEAD','TESTE','ATIVO','INATIVO','CANCELADO')),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nethanel_customer_products (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.nethanel_customers(id) on delete cascade,
  product_id uuid not null references public.nethanel_products(id) on delete cascade,
  external_customer_id text,
  plan_name text,
  status text not null default 'ATIVO',
  mrr numeric(14,2) not null default 0,
  lifetime_value numeric(14,2) not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(customer_id, product_id)
);

create table if not exists public.nethanel_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  product_id uuid references public.nethanel_products(id) on delete set null,
  stage text not null default 'LEAD'
    check (stage in ('LEAD','INTERESSADO','TESTE','NEGOCIACAO','CLIENTE','PERDIDO')),
  source text,
  potential_value numeric(14,2) not null default 0,
  next_action_at timestamptz,
  loss_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nethanel_financial_entries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.nethanel_products(id) on delete set null,
  entry_type text not null check (entry_type in ('RECEITA','DESPESA','REEMBOLSO','TAXA')),
  category text not null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'CONFIRMADO'
    check (status in ('PENDENTE','CONFIRMADO','CANCELADO')),
  occurred_at date not null default current_date,
  payment_method text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_nethanel_finance_date
  on public.nethanel_financial_entries(occurred_at desc);

create table if not exists public.nethanel_goals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.nethanel_products(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  revenue_target numeric(14,2) not null default 0,
  new_customers_target integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique(product_id, period_start, period_end)
);

create table if not exists public.nethanel_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.nethanel_products(id) on delete cascade,
  severity text not null default 'INFO'
    check (severity in ('INFO','ATENCAO','CRITICO','SUCESSO')),
  title text not null,
  message text,
  status text not null default 'ABERTO'
    check (status in ('ABERTO','RESOLVIDO','IGNORADO')),
  action_url text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.nethanel_sync_status (
  product_id uuid primary key references public.nethanel_products(id) on delete cascade,
  sync_mode text not null default 'SNAPSHOT'
    check (sync_mode in ('SNAPSHOT','AUTOMATICO','MANUAL')),
  last_sync_at timestamptz,
  last_status text not null default 'PENDENTE'
    check (last_status in ('OK','PENDENTE','ERRO')),
  details text,
  updated_at timestamptz not null default now()
);

create table if not exists public.nethanel_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.nethanel_products enable row level security;
alter table public.nethanel_product_metrics enable row level security;
alter table public.nethanel_product_plans enable row level security;
alter table public.nethanel_customers enable row level security;
alter table public.nethanel_customer_products enable row level security;
alter table public.nethanel_leads enable row level security;
alter table public.nethanel_financial_entries enable row level security;
alter table public.nethanel_goals enable row level security;
alter table public.nethanel_alerts enable row level security;
alter table public.nethanel_sync_status enable row level security;
alter table public.nethanel_audit_log enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'nethanel_products',
    'nethanel_product_metrics',
    'nethanel_product_plans',
    'nethanel_customers',
    'nethanel_customer_products',
    'nethanel_leads',
    'nethanel_financial_entries',
    'nethanel_goals',
    'nethanel_alerts',
    'nethanel_sync_status',
    'nethanel_audit_log'
  ]
  loop
    execute format(
      'drop policy if exists nethanel_admin_all on public.%I',
      table_name
    );
    execute format(
      'create policy nethanel_admin_all on public.%I for all to authenticated using ((select private.nethanel_is_admin())) with check ((select private.nethanel_is_admin()))',
      table_name
    );
    execute format('revoke all on table public.%I from anon', table_name);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      table_name
    );
  end loop;
end $$;

insert into public.nethanel_products
(slug,name,description,status,repo_full_name,app_url,source_project_ref,source_schema,display_order)
values
('elo','Elo','Gestão integrada para igrejas, membros, cultos, equipes, comunicação e Elo Kids.','ATIVO','Dalton755/nethanel-church',null,'esukjhuyooppxgfmltkb','public',1),
('ebd-manager','EBD Manager','Gestão de Escola Bíblica Dominical, classes, alunos, presença, planos e materiais.','ATIVO','Dalton755/ebd-manager',null,'sxghzubovthsvmfqncch','ebd',2),
('verbo','VERBO','Leitura, sermões, EBD e organização de conteúdo cristão.','ATIVO','Dalton755/verbo-app','https://verbo.nethanel.com.br','neqbrwzkrnkyxxaiwhoq','biblia_slides',3),
('rumo','Rumo','Gestão financeira pessoal, compromissos, dívidas, projeções e inteligência financeira.','ATIVO','Dalton755/rumo-financas',null,'sxghzubovthsvmfqncch','rumo',4)
on conflict (slug) do update set
  name=excluded.name,
  description=excluded.description,
  status=excluded.status,
  repo_full_name=excluded.repo_full_name,
  app_url=excluded.app_url,
  source_project_ref=excluded.source_project_ref,
  source_schema=excluded.source_schema,
  display_order=excluded.display_order,
  updated_at=now();

insert into public.nethanel_sync_status(product_id,sync_mode,last_sync_at,last_status,details)
select id,'SNAPSHOT',now(),'OK','Snapshot inicial criado a partir dos bancos reais.'
from public.nethanel_products
on conflict (product_id) do nothing;

insert into public.nethanel_product_plans
(product_id,source_plan_key,name,billing_type,price,active,trial_enabled,trial_days,limits)
select id,'GRATUITO','Elo Livre','FREE',0,true,false,0,
  '{"units":1,"people":50,"departments":2,"management_users":2,"active_service_series":4}'::jsonb
from public.nethanel_products where slug='elo'
on conflict(product_id,source_plan_key) do nothing;

insert into public.nethanel_product_plans
(product_id,source_plan_key,name,billing_type,price,active,trial_enabled,trial_days)
select id,'ELO_IGREJA','Elo Igreja','MONTHLY',59.90,true,true,14
from public.nethanel_products where slug='elo'
on conflict(product_id,source_plan_key) do nothing;

insert into public.nethanel_product_plans
(product_id,source_plan_key,name,billing_type,price,active,trial_enabled,trial_days)
select id,'VERBO_VITALICIO','VERBO Vitalício','ONE_TIME',19.90,true,true,7
from public.nethanel_products where slug='verbo'
on conflict(product_id,source_plan_key) do nothing;

insert into public.nethanel_product_plans
(product_id,source_plan_key,name,billing_type,price,active,trial_enabled,trial_days)
select id,'SEMENTE','Semente','MONTHLY',29.90,true,true,5
from public.nethanel_products where slug='ebd-manager'
on conflict(product_id,source_plan_key) do nothing;

insert into public.nethanel_product_plans
(product_id,source_plan_key,name,billing_type,price,active,trial_enabled,trial_days)
select id,'CRESCIMENTO','Crescimento','MONTHLY',59.90,true,false,0
from public.nethanel_products where slug='ebd-manager'
on conflict(product_id,source_plan_key) do nothing;

insert into public.nethanel_product_plans
(product_id,source_plan_key,name,billing_type,price,active,trial_enabled,trial_days)
select id,'IGREJA','Igreja','MONTHLY',99.90,true,false,0
from public.nethanel_products where slug='ebd-manager'
on conflict(product_id,source_plan_key) do nothing;

insert into public.nethanel_product_plans
(product_id,source_plan_key,name,billing_type,price,active)
select id,'GRATUITO','Gratuito','FREE',0,true
from public.nethanel_products where slug='rumo'
on conflict(product_id,source_plan_key) do nothing;

insert into public.nethanel_product_plans
(product_id,source_plan_key,name,billing_type,price,active)
select id,'PREMIUM','Premium','MONTHLY',19.90,true
from public.nethanel_products where slug='rumo'
on conflict(product_id,source_plan_key) do nothing;

insert into public.nethanel_product_metrics
(product_id,users_total,customers_total,paying_customers,trials_active,subscriptions_active,revenue_month,revenue_total,mrr,extra)
select p.id,4,1,1,0,1,0,0,59.90,'{"pessoas":8,"fonte":"Elo Supabase"}'::jsonb
from public.nethanel_products p
where p.slug='elo'
  and not exists (
    select 1 from public.nethanel_product_metrics m where m.product_id=p.id
  );

insert into public.nethanel_product_metrics
(product_id,users_total,customers_total,paying_customers,trials_active,subscriptions_active,revenue_month,revenue_total,mrr,extra)
select p.id,64,3,0,0,3,0,0,0,'{"pessoas":88,"igrejas":3,"fonte":"EBD Manager Supabase"}'::jsonb
from public.nethanel_products p
where p.slug='ebd-manager'
  and not exists (
    select 1 from public.nethanel_product_metrics m where m.product_id=p.id
  );

insert into public.nethanel_product_metrics
(product_id,users_total,customers_total,paying_customers,trials_active,subscriptions_active,revenue_month,revenue_total,mrr,extra)
select p.id,15,15,2,0,2,59.76,59.76,0,
  '{"sessoes_ativas":12,"livros":13,"sermoes":2,"aulas":1,"fonte":"VERBO Supabase"}'::jsonb
from public.nethanel_products p
where p.slug='verbo'
  and not exists (
    select 1 from public.nethanel_product_metrics m where m.product_id=p.id
  );

insert into public.nethanel_product_metrics
(product_id,users_total,customers_total,paying_customers,trials_active,subscriptions_active,revenue_month,revenue_total,mrr,extra)
select p.id,117,4,1,0,4,19.90,19.90,19.90,
  '{"pagamentos_aprovados":1,"fonte":"Rumo Supabase"}'::jsonb
from public.nethanel_products p
where p.slug='rumo'
  and not exists (
    select 1 from public.nethanel_product_metrics m where m.product_id=p.id
  );
