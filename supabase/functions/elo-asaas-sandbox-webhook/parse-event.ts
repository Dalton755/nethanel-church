// Nethanel Elo: validação pura, sem acesso a banco ou API de pagamento.
// Este receptor aceita SOMENTE cobranças Pix de R$ 5,00 criadas via link
// no Sandbox do Asaas; jamais atualiza acesso, assinaturas ou finanças.
export const ALLOWED_TYPES = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_REFUNDED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
]);

export type SandboxReceipt = {
  event_id: string;
  event_type: string;
  payment_id: string;
  payment_link_id: string;
  reference_label: string | null;
  amount_cents: number;
  state: "pending" | "confirmed" | "refunded" | "overdue" | "deleted";
  source_environment: "sandbox";
};

const safeId = (v: unknown) => typeof v === "string" && v.length >= 5 &&
  v.length <= 150 && /^[a-zA-Z0-9_:\-.&]+$/.test(v);

export function parseSandboxPixEvent(payload: unknown): SandboxReceipt | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.event !== "string" || !ALLOWED_TYPES.has(root.event)) return null;
  if (!safeId(root.id)) return null;

  const p = root.payment;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const payment = p as Record<string, unknown>;
  if (!safeId(payment.id) || !safeId(payment.paymentLink)) return null;
  // O unico link de teste criado ate aqui e Pix R$ 5,00.
  const value = Number(payment.value);
  if (!Number.isFinite(value) || Math.round(value * 100) !== 500) return null;
  const externalReference = String(payment.externalReference ?? "");
  const ref = /^elo-test-donation-[0-9]{6,24}$/.test(externalReference)
    ? externalReference : null;
  const state =
    root.event === "PAYMENT_RECEIVED" || root.event === "PAYMENT_CONFIRMED"
      ? "confirmed"
      : root.event === "PAYMENT_REFUNDED" ? "refunded"
      : root.event === "PAYMENT_OVERDUE" ? "overdue"
      : root.event === "PAYMENT_DELETED" ? "deleted"
      : "pending";

  return {
    event_id: root.id as string,
    event_type: root.event,
    payment_id: payment.id as string,
    payment_link_id: payment.paymentLink as string,
    reference_label: ref,
    amount_cents: 500,
    state,
    source_environment: "sandbox",
  };
}
