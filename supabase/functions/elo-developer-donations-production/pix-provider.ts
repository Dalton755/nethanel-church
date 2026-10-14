// Código preparatório: NÃO importado pela função em produção enquanto bloqueada.
// Antes de liberar, uma nova revisão/autorização deve atualizar index.ts.
export const ASAAS_PRODUCTION_URL = "https://api.asaas.com/v3";
const userAgent = "Nethanel-Elo-Voluntary-Offerings/1.0";

export type PixResult = {
  id: string;
  payload: string;
  expiresAt: string;
};

const headers = (key: string) => ({
  "access_token": key,
  "accept": "application/json",
  "content-type": "application/json",
  "User-Agent": userAgent,
});

export function validateProductionPixInput(key: string, cents: number, cycle: string) {
  if (!key.startsWith("$aact_prod_") || !Number.isSafeInteger(cents) ||
      cents < 500 || cents > 5_000_000 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cycle)) {
    throw new Error("Parâmetros de produção inválidos.");
  }
}

export function chooseActivePixKey(data: unknown): string | null {
  if (!data || typeof data !== "object" ||
      !Array.isArray((data as Record<string, unknown>).data)) return null;
  const list = (data as {data: unknown[]}).data;
  const first = list.find((entry: unknown) =>
    entry !== null && typeof entry === "object" &&
    (entry as Record<string, unknown>).status === "ACTIVE" &&
    typeof (entry as Record<string, unknown>).key === "string" &&
    String((entry as Record<string, unknown>).key).length >= 8);
  return first ? String((first as Record<string, unknown>).key) : null;
}

export async function createProductionPix(
  key: string, cents: number, cycleId: string,
): Promise<PixResult> {
  validateProductionPixInput(key, cents, cycleId);
  const addresses = await fetch(ASAAS_PRODUCTION_URL + "/pix/addressKeys?status=ACTIVE&limit=20", {
    method: "GET", headers: headers(key), signal: AbortSignal.timeout(15_000),
  });
  if (!addresses.ok) throw new Error("Não foi possível consultar a chave Pix real.");
  const activeKey = chooseActivePixKey(await addresses.json().catch(() => null));
  if (!activeKey) throw new Error("Conta Asaas sem chave Pix ativa.");

  const response = await fetch(ASAAS_PRODUCTION_URL + "/pix/qrCodes/static", {
    method: "POST", headers: headers(key),
    body: JSON.stringify({
      addressKey: activeKey,
      description: "Apoio voluntário ao desenvolvedor Nethanel Elo",
      value: cents / 100,
      format: "PAYLOAD",
      allowsMultiplePayments: false,
      expirationSeconds: 86400,
      externalReference: "elo-prod:" + cycleId,
    }),
    signal: AbortSignal.timeout(22_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload.id !== "string" ||
      typeof payload.payload !== "string" || payload.payload.length < 30 ||
      payload.payload.length > 2000 || payload.id.length > 150) {
    // Não registrar dados do provedor nem a chave API em logs/exceções.
    throw new Error("Não foi possível gerar Pix no Asaas de produção.");
  }
  return { id: payload.id, payload: payload.payload,
    expiresAt: new Date(Date.now() + 86400_000).toISOString() };
}

export async function revokeProductionPix(key: string, qrId: string): Promise<boolean> {
  if (!key.startsWith("$aact_prod_") || !/^[a-zA-Z0-9_-]{5,150}$/.test(qrId))
    return false;
  const response = await fetch(ASAAS_PRODUCTION_URL + "/pix/qrCodes/static/" + encodeURIComponent(qrId), {
    method: "DELETE", headers: headers(key), signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  return response?.ok === true || response?.status === 404;
}
