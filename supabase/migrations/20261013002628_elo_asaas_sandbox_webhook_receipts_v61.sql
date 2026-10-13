-- Elo: coletor *somente* para eventos de teste no Asaas Sandbox.
-- Nao altera assinaturas, planos, faturas ou dados financeiros das igrejas.
create table if not exists public.elo_asaas_sandbox_webhook_receipts (
  event_id text primary key
    check (length(event_id) between 5 and 150),
  event_type text not null
    check (event_type in (
      'PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_CONFIRMED',
      'PAYMENT_RECEIVED','PAYMENT_REFUNDED','PAYMENT_OVERDUE',
      'PAYMENT_DELETED'
    )),
  payment_id text not null
    check (length(payment_id) between 5 and 150),
  payment_link_id text
    check (payment_link_id is null or length(payment_link_id) between 5 and 150),
  reference_label text
    check (reference_label is null or length(reference_label) <= 96),
  amount_cents integer not null
    check (amount_cents between 0 and 5000000),
  state text not null
    check (state in ('pending','confirmed','refunded','overdue','deleted')),
  source_environment text not null default 'sandbox'
    check (source_environment = 'sandbox'),
  received_at timestamptz not null default now()
);
create index if not exists elo_asaas_sandbox_receipts_payment_idx
  on public.elo_asaas_sandbox_webhook_receipts(payment_id, received_at desc);
alter table public.elo_asaas_sandbox_webhook_receipts enable row level security;
revoke all on table public.elo_asaas_sandbox_webhook_receipts
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.elo_asaas_sandbox_webhook_receipts to service_role;

-- A tabela esta isolada dos dados financeiros de igrejas.
-- Nao ha grant para clientes nem RPC de escrita.
notify pgrst,'reload schema';
