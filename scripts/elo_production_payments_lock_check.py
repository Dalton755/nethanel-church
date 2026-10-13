#!/usr/bin/env python3
"""Static fail-closed readiness gate. Never connects to Asaas or Supabase."""
from pathlib import Path

root = Path("supabase/functions")
payment = (root / "elo-developer-donations-production/index.ts").read_text()
webhook = (root / "elo-asaas-production-webhook/index.ts").read_text()
sandbox = (root / "elo-developer-donations/index.ts").read_text()
app = Path("apps/mobile/src/features/more/DeveloperOfferingScreen.tsx").read_text()

def require(ok: bool, name: str):
    assert ok, name
    print("PASS:", name)

require("LIVE_DONATIONS_IMPLEMENTED = false" in payment, "Produção não pode gerar cobranças")
require("LIVE_WEBHOOK_IMPLEMENTED = false" in webhook, "Webhook real sem conciliação não processa")
require('503, "production_donations_disabled"' in payment, "Toda tentativa de cobrar retorna 503")
require('503, "production_webhook_disabled"' in webhook, "Webhook configurado também fica desligado")
require('"ELO_DONATIONS_PRODUCTION_ENABLED"' in payment, "Variável sinalizada mas incapaz de ativar por engano")
require('"ELO_ASAAS_PRODUCTION_WEBHOOK_TOKEN"' in webhook, "Token Webhook produção separado")
require('"asaas-access-token"' in webhook and "constantTimeEquals" in webhook, "Rejeita token ausente ou inválido")
require("verify_jwt" not in payment and "verify_jwt" not in webhook, "JWT é configurado no Supabase e não no corpo do código")
require("fetch(" not in payment and "fetch(" not in webhook, "Nenhuma chamada externa ou criação de cobrança nos novos endpoints")
require(".from(" not in payment and ".from(" not in webhook and ".rpc(" not in payment and ".rpc(" not in webhook, "Nenhuma leitura ou alteração no banco de dados")
require("elo-developer-donations-production" not in app, "Aplicativo não aponta para produção")
require('const SANDBOX_URL = "https://api-sandbox.asaas.com/v3"' in sandbox, "Integração Sandbox anterior intacta")
print("SEGURO: infraestrutura de pagamentos reais desativada por código.")
