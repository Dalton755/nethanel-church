import { prepareDonationEvent, type DonationRecord } from "./payment-event.ts";

function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const demoId = "101212c5-6e81-4915-ae9a-fbde5b42bb04";
const baseDonation: DonationRecord = {
  id: demoId,
  amount_cents: 500,
  environment: "sandbox",
  frequency: "once",
  payment_link_id: "plink_elodemotest",
  provider_subscription_id: null,
};
function event(override: Record<string, unknown> = {}) {
  return {
    id: "evt_test_Pix_01",
    event: "PAYMENT_RECEIVED",
    payment: {
      id: "pay_test_0001",
      paymentLink: "plink_elodemotest",
      value: 5,
      ...override,
    },
  };
}

Deno.test("Pix R$5 Sandbox -> paid com ID do evento", () => {
  const result = prepareDonationEvent(event(), baseDonation, "sandbox");
  ensure(result, "Evento não foi interpretado");
  ensure(result.status === "paid", "Status incorreto");
  ensure(result.amount_cents === 500, "Valor em centavos incorreto");
  ensure(result.event_key === "sandbox:evt_test_Pix_01", "Chave de idempotência incorreta");
});

Deno.test("mesmo evento recebido duas vezes produz mesma chave", () => {
  const first = prepareDonationEvent(event(), baseDonation, "sandbox");
  const repeated = prepareDonationEvent(event(), baseDonation, "sandbox");
  ensure(first && repeated && first.event_key === repeated.event_key,
    "Chave mudou em tentativa repetida");
});

Deno.test("evento adulterado nunca recebe crédito", () => {
  let blocked = false;
  try {
    prepareDonationEvent(event({ value: 500 }), baseDonation, "sandbox");
  } catch { blocked = true; }
  ensure(blocked, "Valor divergente foi aceito");
});

Deno.test("produção nunca pode registrar em oferta sandbox", () => {
  let blocked = false;
  try {
    prepareDonationEvent(event(), baseDonation, "production");
  } catch { blocked = true; }
  ensure(blocked, "Evento atravessou ambientes");
});

Deno.test("evento de outra conta/link é bloqueado", () => {
  let blocked = false;
  try {
    prepareDonationEvent(event({ paymentLink: "plink_outro" }), baseDonation, "sandbox");
  } catch { blocked = true; }
  ensure(blocked, "Associação indevida foi aceita");
});

Deno.test("evento externo que não seja pagamento é ignorado", () => {
  const result = prepareDonationEvent({ id:"evt_unknown", event:"SUBSCRIPTION_CREATED", payment:{} },
    baseDonation, "sandbox");
  ensure(result === null, "Evento inesperado foi tratado como financeiro");
});

Deno.test("confirmação reconhece vínculo por referência externa exata", () => {
  const p = event({ paymentLink: null, externalReference: `elo-donation:${demoId}` });
  const out = prepareDonationEvent(p, baseDonation, "sandbox");
  ensure(out && out.status === "paid", "Referência externa válida não reconhecida");
});

Deno.test("oferta mensal reconhece cobranças pela assinatura", () => {
  const monthly: DonationRecord = { ...baseDonation, frequency:"monthly",
    payment_link_id:null, provider_subscription_id:"sub_test_recorrente" };
  const out = prepareDonationEvent(event({ paymentLink:null,
    subscription:"sub_test_recorrente" }), monthly, "sandbox");
  ensure(out && out.status === "paid" && out.provider_subscription_id === "sub_test_recorrente",
    "Cobrança recorrente válida foi recusada");
});

Deno.test("estorno reconhecido e nunca se torna confirmação", () => {
  const result = prepareDonationEvent({ ...event(), event:"PAYMENT_REFUNDED" },
    baseDonation, "sandbox");
  ensure(result && result.status==="refunded", "Estorno não identificado");
});

Deno.test("evento sem identificador não pode entrar no histórico", () => {
  let rejected = false;
  try {
    prepareDonationEvent({ ...event(), id:"" }, baseDonation,"sandbox");
  } catch { rejected = true; }
  ensure(rejected, "Evento sem ID não foi bloqueado");
});

Deno.test("Pix mensal do período reconhecido pelo QR mesmo sem dados de pagador", () => {
  const cycle: DonationRecord = {
    ...baseDonation,frequency:"monthly",payment_link_id:null,
    provider_pix_qr_id:"pixqr_month_202610",
    provider_monthly_cycle_id:"06e05a26-aa13-424e-9136-5f20b38c78f1",
  };
  const payload=event({paymentLink:null,pixQrCodeId:"pixqr_month_202610",
    externalReference:"elo-monthly:06e05a26-aa13-424e-9136-5f20b38c78f1"});
  const result=prepareDonationEvent(payload,cycle,"sandbox");
  ensure(result?.status==="paid" && result?.amount_cents===500,
    "O Pix mensal manual não foi conciliado.");
});

Deno.test("Pix mensal não pode ser creditado a ciclo de outra oferta", () => {
  const cycle: DonationRecord = {
    ...baseDonation,frequency:"monthly",payment_link_id:null,
    provider_pix_qr_id:"pixqr_month_202610",
    provider_monthly_cycle_id:"06e05a26-aa13-424e-9136-5f20b38c78f1",
  };
  let denied=false;
  try {
    prepareDonationEvent(event({
      paymentLink:null,pixQrCodeId:"pixqr_outro",
      externalReference:"elo-monthly:ff5d665c-fb0e-47e1-aa8b-0be9a40fb008",
    }),cycle,"sandbox");
  } catch {denied=true;}
  ensure(denied,"QR de outro mês foi aceito.");
});
