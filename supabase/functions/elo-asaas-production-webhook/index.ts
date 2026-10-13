// Nethanel Elo — futuro Webhook Asaas PRODUÇÃO, independente do Sandbox.
// Não registrar esta URL no Asaas até existir motor de conciliação e autorização.
// A função NUNCA confirma, registra ou processa eventos enquanto estiver bloqueada.
export const LIVE_WEBHOOK_IMPLEMENTED = false as const;

const json = (status: number, code: string) =>
  new Response(JSON.stringify({ ok: false, code, paymentsEnabled: false }), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

async function constantTimeEquals(expected: string, received: string): Promise<boolean> {
  const e = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", e.encode(expected)),
    crypto.subtle.digest("SHA-256", e.encode(received)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, "method_not_allowed");

  const secret = (Deno.env.get("ELO_ASAAS_PRODUCTION_WEBHOOK_TOKEN") ?? "").trim();
  // O token deve ser distinto da chave API e do token do webhook Sandbox.
  if (secret.length < 32 || secret.length > 255 || /\s/.test(secret) ||
      secret.startsWith("$aact_")) {
    return json(503, "production_webhook_not_configured");
  }
  const supplied = request.headers.get("asaas-access-token") ?? "";
  if (!supplied || supplied.length > 255 ||
      !(await constantTimeEquals(secret, supplied))) {
    return json(401, "invalid_webhook_token");
  }
  // Mesmo com credencial correta não processa eventos reais.
  // Responder 503 demonstra que esta URL NÃO está pronta para registro no Asaas.
  return json(503, "production_webhook_disabled");
});
