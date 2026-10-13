// Asaas -> Nethanel Elo: interpretação PURA, sem acesso a banco ou rede.
// Testada antes de habilitar qualquer webhook financeiro.
export type DonationRecord = {
  id: string;
  amount_cents: number;
  environment: "sandbox" | "production";
  frequency: "once" | "monthly";
  payment_link_id: string | null;
  provider_subscription_id: string | null;
  provider_pix_qr_id?: string | null;
  provider_monthly_cycle_id?: string | null;
};

export type DonationEvent = {
  donation_id: string;
  event_key: string;
  provider_payment_id: string;
  status: "paid" | "refunded" | "overdue" | "canceled" | "pending";
  amount_cents: number;
  provider_subscription_id: string | null;
};

export const DONATION_PAYMENT_EVENTS = {
  PAYMENT_RECEIVED: "paid",
  PAYMENT_CONFIRMED: "paid",
  PAYMENT_REFUNDED: "refunded",
  PAYMENT_OVERDUE: "overdue",
  PAYMENT_DELETED: "canceled",
  PAYMENT_CREATED: "pending",
  PAYMENT_UPDATED: "pending",
} as const;

export function prepareDonationEvent(
  payload: unknown,
  donation: DonationRecord,
  environment: "sandbox" | "production",
): DonationEvent | null {
  if (payload === null || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const event = String(body.event ?? "");
  if (!Object.hasOwn(DONATION_PAYMENT_EVENTS, event)) return null;
  const payment =
    body.payment && typeof body.payment === "object"
      ? body.payment as Record<string, unknown>
      : null;
  if (!payment || typeof payment.id !== "string" || payment.id.length < 5 ||
      payment.id.length > 150) return null;

  const linkId = typeof payment.paymentLink === "string" ? payment.paymentLink : null;
  const subscriptionId =
    typeof payment.subscription === "string" ? payment.subscription : null;
  const pixQrId =
    typeof payment.pixQrCodeId === "string" ? payment.pixQrCodeId : null;
  const exactExternalRef = payment.externalReference === `elo-donation:${donation.id}` ||
    Boolean(donation.provider_monthly_cycle_id &&
      payment.externalReference === `elo-monthly:${donation.provider_monthly_cycle_id}`);
  const belongsToDonation =
    Boolean(linkId && linkId === donation.payment_link_id) ||
    Boolean(subscriptionId && subscriptionId === donation.provider_subscription_id) ||
    Boolean(pixQrId && pixQrId === donation.provider_pix_qr_id) ||
    exactExternalRef;
  if (!belongsToDonation) {
    throw new Error("Cobrança sem vínculo válido com a oferta.");
  }
  if (donation.environment !== environment) {
    throw new Error("Ambiente do pagamento divergente.");
  }
  const amount = Number(payment.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Valor inválido recebido.");
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents !== donation.amount_cents) {
    throw new Error("Valor da cobrança difere da oferta registrada.");
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (id.length < 5 || id.length > 150) {
    throw new Error("Evento sem identificador confiável.");
  }

  return {
    donation_id: donation.id,
    event_key: `${environment}:${id}`,
    provider_payment_id: payment.id,
    status: DONATION_PAYMENT_EVENTS[event as keyof typeof DONATION_PAYMENT_EVENTS],
    amount_cents: cents,
    provider_subscription_id: subscriptionId,
  };
}
