#!/usr/bin/env python3
"""Offline-only preflight: SQL draft not applied; production endpoints stay hard blocked."""
from pathlib import Path
import re
from pglast import parse_sql

migration_path=Path("supabase/drafts/20261014_elo_production_pix_PILOT_DO_NOT_APPLY.sql")
sql=migration_path.read_text(encoding="utf-8")
donation=Path("supabase/functions/elo-developer-donations-production/index.ts").read_text()
webhook=Path("supabase/functions/elo-asaas-production-webhook/index.ts").read_text()
provider=Path("supabase/functions/elo-developer-donations-production/pix-provider.ts").read_text()
production_flow=Path("supabase/functions/elo-developer-donations-production/production-flow.ts").read_text()
webhook_flow=Path("supabase/functions/elo-asaas-production-webhook/webhook-flow.ts").read_text()
checks=[
 (len(parse_sql(sql)) >= 20,"SQL do piloto real sintaticamente válido"),
 ("create table if not exists public.elo_prod_offering_intents" in sql and
  "create table if not exists public.elo_prod_pix_cycles" in sql and
  "create table if not exists public.elo_prod_pix_events" in sql,
  "Dados reais isolados em 3 novas tabelas"),
 (sql.count("enable row level security") >= 3 and
  sql.count("revoke all on public.elo_prod_") >= 3,
  "Proteções RLS e sem acesso direto anônimo/usuário"),
 ("can_manage_elo_prod_offering" in sql and
  "platform_admins pa" in sql and
  "101212c5-6e81-4915-ae9a-fbde5b42bb04" in sql,
  "Piloto somente Demo + administrador global"),
 ("unique(intent_id,period)" in sql and
  "unique(provider_event_id)" not in sql and
  "provider_event_id text not null unique" in sql and
  "on conflict(provider_event_id) do nothing" in sql,
  "QR único por mês e evento Asaas idempotente"),
 ("for update" in sql and "record_elo_prod_pix_event" in sql and
  "p_amount_cents" in sql and "p_qr_id" in sql,
  "Banco valida QR, valor e usa locks transacionais"),
 ("auth.role()" in sql and "service_role" in sql,
  "Escrita de QR e confirmação financeiras somente serviço"),
 ("LIVE_DONATIONS_IMPLEMENTED = false" in donation and
  "LIVE_WEBHOOK_IMPLEMENTED = false" in webhook and
  '503, "production_donations_disabled"' in donation and
  '503, "production_webhook_disabled"' in webhook,
  "Pagamento e webhook hard-blocked em HTTP 503"),
 ("production-flow.ts" not in donation and
  "webhook-flow.ts" not in webhook,
  "Motores reais NÃO importados pelos endpoints instalados"),
 ('"https://api.asaas.com/v3"' in provider and
  '"allowsMultiplePayments": false' not in provider and
  'allowsMultiplePayments: false' in provider,
  "QR real de pagamento único sem duplicidade permitida"),
 ("ELO_DONATIONS_PRODUCTION_ENABLED" in production_flow and
  "ELO_DONATIONS_PRODUCTION_ENABLED" in webhook_flow,
  "Mesmo módulos inativos exigem habilitação futura separada"),
 ("request_elo_prod_offering" in production_flow and
  "reserve_elo_prod_pix_cycle" in production_flow and
  "record_elo_prod_pix_event" in webhook_flow,
  "Futuros motores só acessam dados isolados"),
 ("organization_subscriptions" not in sql and
  "billing_invoices" not in sql and
  "elo_developer_donations" not in sql,
  "Nenhuma modificação em cobranças legadas ou dados Sandbox"),
 (not re.search(r"\b(delete from|truncate|drop table|drop function)\b",sql,re.I),
  "Migration sem instruções destrutivas"),
]
for valid,name in checks:
 if not valid: raise AssertionError(name)
 print("PASS",name)
print("Pix real e webhook prontos apenas como código inativo. NÃO aplicado/ativado.")
