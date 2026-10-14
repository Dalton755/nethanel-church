// Parse de webhook Pix estático Asaas PRODUÇÃO — somente validação offline.
// IMPORTANTE: o externalReference do QR estático NÃO é garantido na cobrança
// criada automaticamente. O vínculo autoritativo é payment.pixQrCodeId,
// consultado contra o QR persistido no Supabase pelo webhook-flow.
export type RealPixEvent = {
  cycleId: string | null;
  qrId: string;
  eventId: string;
  paymentId: string;
  eventType: string;
  state: "pending" | "paid" | "refunded" | "canceled";
  amountCents: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// IDs de eventos reais Asaas podem conter "&" (ex.: evt_...&368604920).
const safeId = (x: unknown): x is string =>
  typeof x === "string" && x.length >= 5 && x.length <= 150 &&
  /^[a-zA-Z0-9._:&-]+$/.test(x);
const eventStates: Record<string, RealPixEvent["state"]> = {
  PAYMENT_CREATED: "pending",
  PAYMENT_UPDATED: "pending",
  PAYMENT_RECEIVED: "paid",
  PAYMENT_CONFIRMED: "paid",
  PAYMENT_REFUNDED: "refunded",
  PAYMENT_DELETED: "canceled",
};

export function parseRealPixEvent(payload: unknown): RealPixEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.event !== "string" || !Object.hasOwn(eventStates, root.event)) return null;
  const payment = root.payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return null;
  const p = payment as Record<string, unknown>;
  if (!safeId(root.id) || !safeId(p.id) || !safeId(p.pixQrCodeId)) return null;
  // Somente cobranças Pix podem conciliar ofertas.
  if (p.billingType !== "PIX") return null;

  // Referência é somente uma checagem adicional quando o provedor a entrega.
  // Ela NÃO precisa estar presente: QR estático cria cobrança APÓS o pagamento.
  let cycleId: string | null = null;
  if (typeof p.externalReference === "string" &&
      p.externalReference.startsWith("elo-prod:")) {
    const candidate = p.externalReference.slice("elo-prod:".length);
    if (!uuid.test(candidate)) return null;
    cycleId = candidate.toLowerCase();
  }

  const amount = p.value;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents / 100 - amount) > 0.000001 ||
      cents < 500 || cents > 5_000_000) return null;
  return {
    cycleId, qrId: p.pixQrCodeId, eventId: root.id, paymentId: p.id,
    eventType: root.event, state: eventStates[root.event], amountCents: cents,
  };
}
