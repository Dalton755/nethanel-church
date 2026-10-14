#!/usr/bin/env python3
"""Read-only production Asaas connectivity check gate; runs with no secrets/network."""
from pathlib import Path

f = Path("supabase/functions/elo-asaas-production-health/index.ts").read_text("utf-8")
ui = Path("apps/mobile/src/features/management/PlatformAdminScreen.tsx").read_text("utf-8")
stubs = [
 Path("supabase/functions/elo-developer-donations-production/index.ts").read_text("utf-8"),
 Path("supabase/functions/elo-asaas-production-webhook/index.ts").read_text("utf-8")
]

def check(cond, explanation):
    assert cond, explanation
    print("PASS:", explanation)

check('https://api.asaas.com/v3/pix/addressKeys?status=ACTIVE&limit=20' in f,
      "Consulta somente lista de chaves Pix ativas, por GET")
check('method: "GET"' in f and 'method: "POST"' not in f and f.count("fetch(") == 1,
      "Sem criação de Pix, pagamento, subconta ou webhook")
check('auth.auth.getUser()' in f and '.from("platform_admins")' in f and '.eq("active", true)' in f,
      "Apenas administrador global autenticado")
check('ELO_ASAAS_PRODUCTION_API_KEY' in f and '.startsWith("$aact_prod_")' in f,
      "Chave real lida em Secret, valida ambiente")
check('"access_token": key' in f and '"User-Agent":' in f,
      "Cabeçalhos de autenticação corretos sem expor chave")
check('paymentsEnabled: false' in f and 'private, no-store' in f,
      "Modo somente diagnóstico e sem cache da resposta")
check('platform_admin_required' in f and 'invalid_session' in f,
      "Rejeita usuários sem privilégio")
check('return json(200, {' in f and "result.data.some" in f,
      "Somente estados da conexão são enviados ao aplicativo")
check("elo-asaas-production-health" in ui and "Verificar conexão Asaas" in ui,
      "Teste visível no painel do administrador global")
check(all("= false as const" in code for code in stubs),
      "Funções de cobrança real e webhook continuam desativadas")
check(not any(token in f for token in ["console.log(key)", "JSON.stringify(result)", ".rpc(", "/payments", "/paymentLinks", "/qrCodes/static"]),
      "Nenhum retorno sensível, leitura SQL arbitrária ou endpoint de cobrança")
print("Diagnóstico de leitura aprovado — transações reais continuam desativadas.")
