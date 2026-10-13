#!/usr/bin/env node
/**
 * Nethanel Elo · homologacao de oferta Pix unica
 * USA APENAS a API do Sandbox Asaas.
 * Não altera Supabase, plano, assinatura, usuário, branch main ou APK.
 * Não pede CPF e não registra qualquer informação pessoal.
 *
 * Env: ASAAS_SANDBOX_API_KEY (NUNCA token de produção).
 */
import { appendFileSync } from "node:fs";

const base = "https://api-sandbox.asaas.com/v3";
const summaryPath = process.env.GITHUB_STEP_SUMMARY || null;
function logSummary(line) {
  if (summaryPath) appendFileSync(summaryPath, line + "\n", "utf8");
  else console.log(line);
}
function fail(message) {
  // A saída das Actions não deve incluir a chave mesmo se o provedor citá-la.
  const clean = String(message)
    .replace(/\\$aact_(?:hmlg|prod)_[^\\s"'<>]+/gi, "[CHAVE OCULTA]")
    .slice(0, 400);
  logSummary("❌ " + clean);
  console.error("ASAAS_SANDBOX_DIAGNOSTIC: " + clean);
  process.exitCode = 1;
}
const key = (process.env.ASAAS_SANDBOX_API_KEY || "").trim();
if (!key) {
  logSummary("### 🔐 Teste de Pix Asaas aguardando chave Sandbox");
  logSummary("O segredo `ASAAS_SANDBOX_API_KEY` ainda não está configurado no repositório. Nenhuma cobrança ou link foi criado.");
  logSummary("Adicione **somente uma chave da conta Sandbox** em Settings → Secrets and variables → Actions → New repository secret.");
  process.exit(0);
}
if (!key.startsWith("$aact_hmlg_")) {
  fail("Chave recusada: utilize exclusivamente uma API Key do Asaas Sandbox (prefixo $aact_hmlg_). Nenhuma requisição foi enviada.");
  process.exit(1);
}
const runId = (process.env.GITHUB_RUN_ID || String(Date.now())).replace(/[^0-9]/g, "");
const payload = {
  name: "Elo · Oferta única · Teste Sandbox",
  description: "Simulação de oferta voluntária de R$ 5,00 no ambiente Sandbox. Não efetuar pagamento bancário real.",
  billingType: "PIX",
  chargeType: "DETACHED",
  value: 5,
  externalReference: `elo-test-donation-${runId}`,
  notificationEnabled: false,
};
logSummary("### 🧪 Asaas Sandbox — Oferta única Pix de R$ 5,00");
logSummary("Ambiente validado: `https://api-sandbox.asaas.com/v3`; link de pagamento não é transação real.");

try {
  const response = await fetch(`${base}/paymentLinks`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "User-Agent": "Nethanel-Elo-Sandbox-Smoke/1.0",
      access_token: key,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.id !== "string" || typeof data.url !== "string") {
    const reason = data.errors?.[0]?.description ?? data.message ?? "Resposta inválida.";
    throw new Error(`Asaas ${response.status}: ${String(reason).slice(0,240)}`);
  }
  const u = new URL(data.url);
  if (u.protocol !== "https:" || !(u.hostname === "asaas.com" || u.hostname.endsWith(".asaas.com"))) {
    throw new Error("Asaas retornou URL fora do domínio seguro.");
  }
  logSummary("✅ Link de teste gerado com sucesso. **Nenhum pagamento foi realizado.**");
  logSummary(`Identificador: \`${data.id.replace(/[^a-zA-Z0-9_-]/g, "")}\``);
  logSummary(`[Abrir checkout Sandbox Pix R$ 5,00](${u.toString()})`);
  logSummary("Abra o link e preencha apenas **dados de teste da conta Sandbox**. Para simular o pagamento, confirme no painel Asaas Sandbox.");
  console.log("ASAAS_SANDBOX_TEST_LINK_CREATED");
} catch (error) {
  fail("Falha ao solicitar link de teste no Asaas Sandbox: " + (error instanceof Error ? error.message : String(error)));
}
