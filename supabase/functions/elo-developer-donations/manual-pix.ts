// Ofertas Pix mensais MANUAIS, exclusivas do Asaas Sandbox / Elo Church Demo.
// Não existe Pix Automático ou cobrança/renovação sem ação do usuário.
export const sandboxApi = "https://api-sandbox.asaas.com/v3";
export const sandboxDemoOrg = "101212c5-6e81-4915-ae9a-fbde5b42bb04";

export type StaticPixResult = {
  id: string;
  payload: string;
  expiresAt: string;
};

export async function createSandboxManualPix(
  key: string,
  amountCents: number,
  reference: string,
  description: string,
): Promise<StaticPixResult> {
  if (!key.startsWith("$aact_hmlg_") || !Number.isSafeInteger(amountCents) ||
      amountCents < 500 || amountCents > 5000000 ||
      !/^elo-(?:monthly|donation):[a-zA-Z0-9:_-]{12,100}$/.test(reference)) {
    throw new Error("Somente ofertas autorizadas no Sandbox são permitidas.");
  }
  const headers = {
    access_token: key,
    accept: "application/json",
    "content-type": "application/json",
    "User-Agent": "Nethanel-Elo-Sandbox-Pix/1.0",
  };
  const keys = await fetch(`${sandboxApi}/pix/addressKeys?status=ACTIVE&limit=20`, {
    headers, signal: AbortSignal.timeout(18000),
  });
  if (keys.status === 401) {
    throw new Error("A chave de API do Asaas Sandbox foi recusada. Confira o Secret no Supabase.");
  }
  const list = await keys.json().catch(() => ({}));
  if (!keys.ok) throw new Error("O Asaas não permitiu consultar as chaves Pix de teste.");
  const active = Array.isArray(list.data) ?
    list.data.find((v: any) => v?.status === "ACTIVE" &&
      typeof v?.key === "string" && v.key.length >= 8) : null;
  if (!active) throw new Error("Cadastre uma chave Pix ATIVA no Asaas Sandbox.");

  const response = await fetch(`${sandboxApi}/pix/qrCodes/static`, {
    method: "POST", headers,
    body: JSON.stringify({
      addressKey: active.key,
      description,
      value: amountCents / 100,
      format: "PAYLOAD",
      allowsMultiplePayments: false,
      expirationSeconds: 86400,
      externalReference: reference,
    }),
    signal: AbortSignal.timeout(22000),
  });
  const pix = await response.json().catch(() => ({}));
  if (!response.ok || typeof pix?.id !== "string" ||
      typeof pix?.payload !== "string" || pix.payload.length < 30 ||
      pix.payload.length > 2000) {
    // Nunca incluir o token em exceções ou logs.
    const providerReason = typeof pix?.errors?.[0]?.description === "string" ?
      pix.errors[0].description.slice(0, 160) : "O Asaas não retornou um Pix válido.";
    throw new Error(providerReason);
  }
  return {
    id: pix.id,
    payload: pix.payload,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

export async function tryDisableSandboxPix(key: string, qrId: string) {
  if (!key.startsWith("$aact_hmlg_") || !/^[a-zA-Z0-9_-]{5,150}$/.test(qrId))
    return false;
  const response = await fetch(`${sandboxApi}/pix/qrCodes/static/${encodeURIComponent(qrId)}`, {
    method: "DELETE",
    headers: { access_token: key, "User-Agent": "Nethanel-Elo-Sandbox-Pix/1.0" },
    signal: AbortSignal.timeout(14000),
  }).catch(() => null);
  return Boolean(response?.ok || response?.status === 404);
}
