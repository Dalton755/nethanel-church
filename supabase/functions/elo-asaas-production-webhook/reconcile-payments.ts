// Recuperação PONTUAL de webhook perdido: interpretação offline de GET /v3/payments?pixQrCodeId=...
// Este módulo NÃO faz chamadas de rede, NÃO gera pagamentos e NÃO é importado
// por nenhum endpoint de produção. Falha fechado em resultado ambíguo.
export type RecoverablePixEvent = {
  cycleId: string;
  qrId: string;
  paymentId: string;
  eventId: string;
  eventType: "PAYMENT_RECEIVED" | "PAYMENT_REFUNDED";
  state: "paid" | "refunded";
  amountCents: number;
};
export type RecoveryPlan =
  | { kind: "none" }
  | { kind: "manual_review"; reason: string }
  | { kind: "recover"; events: RecoverablePixEvent[] };

type Cycle = { id: string; providerQrId: string; amountCents: number };
type Payment = Record<string, unknown>;
const idPattern = /^[a-zA-Z0-9._:-]{5,150}$/;

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
}

export async function planMissingPixWebhook(
  cycle: Cycle, response: unknown,
): Promise<RecoveryPlan> {
  if (!idPattern.test(cycle.providerQrId) ||
      !Number.isSafeInteger(cycle.amountCents) || cycle.amountCents < 500) {
    return { kind: "manual_review", reason: "invalid_cycle" };
  }
  if (!response || typeof response !== "object") return { kind: "manual_review", reason: "invalid_response" };
  const root = response as Record<string,unknown>;
  if (root.hasMore !== false || !Array.isArray(root.data)) {
    return { kind: "manual_review", reason: "incomplete_page" };
  }
  // Nunca usar externalReference como chave de associação.
  const matching = root.data.filter((entry): entry is Payment =>
    !!entry && typeof entry === "object" && !Array.isArray(entry) &&
    (entry as Payment).pixQrCodeId === cycle.providerQrId);
  if (matching.length === 0) return { kind: "none" };
  if (matching.length !== 1) return { kind: "manual_review", reason: "multiple_receipts" };
  const p = matching[0];
  if (p.billingType !== "PIX" || typeof p.id !== "string" || !idPattern.test(p.id) ||
      typeof p.value !== "number" || !Number.isFinite(p.value) ||
      Math.abs(p.value * 100 - cycle.amountCents) > 0.000001) {
    return { kind: "manual_review", reason: "payment_mismatch" };
  }
  const status = p.status;
  if (status !== "RECEIVED" && status !== "CONFIRMED" && status !== "REFUNDED") {
    return { kind: "none" };
  }
  const states: Array<"paid"|"refunded"> = status === "REFUNDED" ? ["paid","refunded"] : ["paid"];
  const events: RecoverablePixEvent[] = [];
  for (const state of states) {
    const eventType = state === "paid" ? "PAYMENT_RECEIVED" : "PAYMENT_REFUNDED";
    // ID sintético estável, menor que 150 caracteres, sem dados pessoais.
    const eventId = "recon:" + await fingerprint(cycle.id + "|" + cycle.providerQrId +
      "|" + p.id + "|" + eventType);
    events.push({
      cycleId: cycle.id, qrId: cycle.providerQrId, paymentId: p.id,
      eventId, eventType, state, amountCents: cycle.amountCents,
    });
  }
  return { kind: "recover", events };
}
