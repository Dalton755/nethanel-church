#!/usr/bin/env python3
"""Read-only safeguards for Nethanel Elo's Asaas Sandbox donation flow.

This is NOT a production migration / activation script. The production switch
must remain OFF until a separately authorized release passes manual gates.
"""
from pathlib import Path
import re

BASE = Path(__file__).resolve().parent.parent
donations = (BASE / "supabase/functions/elo-developer-donations/index.ts").read_text(encoding="utf-8")
manual_pix = (BASE / "supabase/functions/elo-developer-donations/manual-pix.ts").read_text(encoding="utf-8")
monthly = (BASE / "supabase/functions/elo-developer-donations/monthly-flow.ts").read_text(encoding="utf-8")
webhook = (BASE / "supabase/functions/elo-asaas-sandbox-webhook/index.ts").read_text(encoding="utf-8")
event = (BASE / "supabase/functions/elo-asaas-sandbox-webhook/payment-event.ts").read_text(encoding="utf-8")
ui = (BASE / "apps/mobile/src/features/more/DeveloperOfferingScreen.tsx").read_text(encoding="utf-8")
month_sql = (BASE / "supabase/migrations/20261013110000_elo_monthly_pix_sandbox_draft.sql").read_text(encoding="utf-8")
single_sql = (BASE / "supabase/migrations/20261013004655_elo_donations_sandbox_demo_v62.sql").read_text(encoding="utf-8")

def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)
    print("PASS:", message)

demo = "101212c5-6e81-4915-ae9a-fbde5b42bb04"
prod_url = "https://api.asaas.com/v3"
require(all(prod_url not in source for source in
    (donations, manual_pix, monthly, webhook, event)),
    "Rotas de doações não acessam a API real do Asaas")
require("https://api-sandbox.asaas.com/v3" in donations and
        "https://api-sandbox.asaas.com/v3" in manual_pix,
    "Pix e checkout apontam somente ao Sandbox")
require('const environment = "sandbox"' in donations and
        "productionEnabled: false" in donations,
    "Ofertas não possuem modo de cobrança real")
require(demo in donations and demo in single_sql and demo in month_sql and demo in ui,
    "Organização Demo restrita nas quatro camadas")
require('ELO_ASAAS_SANDBOX_API_KEY' in donations and
        '"$aact_hmlg_"' in donations and
        '"$aact_hmlg_"' in manual_pix,
    "Chave exclusiva de Sandbox no servidor")
require('auth.getUser()' in donations and 'request_elo_monthly_pix_pledge' in donations,
    "Autenticação Supabase e RPC privilegiada")
require('app_private.can_manage_elo_donation' in single_sql and
        'app_private.can_manage_elo_donation' in month_sql,
    "Controle de perfil no banco para ofertas")
require('request.headers.get("asaas-access-token")' in webhook and
        "await secureEquals(secret,supplied)" in webhook and
        "length < 32" in webhook,
    "Webhook testa token dedicado sem confiança no cliente")
require('PAYMENT_RECEIVED' in event and
        'elo_apply_developer_monthly_pix_event' in webhook and
        'elo_apply_developer_donation_event' in webhook,
    "Webhook de pagamento grava histórico nos RPCs próprios")
require('unique(event_key)' in single_sql and
        "on conflict(event_key) do nothing" in month_sql,
    "Conciliação idempotente mesmo com notificações repetidas")
require('unique(donation_id,month_period)' in month_sql and
        "cancel_elo_monthly_pix_pledge" in monthly and
        "elo_commit_monthly_pix_qr" in monthly,
    "Pix mensal único por competência e cancelamento transacional")
require('enable row level security' in month_sql and
        'revoke all on public.elo_developer_monthly_pix_cycles from public,anon,authenticated' in month_sql,
    "Histórico Pix mensal inacessível diretamente ao cliente")
require('"Copiar código Pix"' in ui and "NÃO REALIZE PAGAMENTO BANCÁRIO" in ui,
    "Interface Sandbox mantém aviso e copia-cola")
require("organization_subscriptions" not in donations and
        "organization_subscriptions" not in monthly and
        "organization_subscriptions" not in webhook,
    "Oferta não altera assinaturas ou bloqueia recursos")
require("ELO_ASAAS_PRODUCTION_API_KEY" not in donations and
        "ELO_ASAAS_PRODUCTION_API_KEY" not in manual_pix,
    "Nenhuma chave de produção vinculada às funções Demo")

print("\nSandbox aprovado em verificações estáticas.")
print("PRODUÇÃO: NÃO APROVADA. Exige integração separada, novos testes e autorização.")
