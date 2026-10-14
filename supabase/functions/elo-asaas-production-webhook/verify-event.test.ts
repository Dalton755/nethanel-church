// Nenhuma chave Asaas, conexão externa ou criação de cobrança neste arquivo.
import { parseRealPixEvent } from "./verify-event.ts";
import { strict as assert } from "node:assert";

const id = "b1eac62a-8194-495e-a385-927c84738301";
const other = "a38f6de2-c561-47f4-aafb-e286ae31e7d3";
const base = {
  id: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
  event: "PAYMENT_RECEIVED",
  payment: {
    id: "pay_000321", pixQrCodeId: "qr_real_321",
    billingType: "PIX", value: 5.00, status: "RECEIVED",
  },
};
const parsed = (value: unknown) => parseRealPixEvent(value);

Deno.test("Pix estatico REAL: reconhece evento sem externalReference", () => {
  assert.deepEqual(parsed(base), {
    cycleId: null, qrId: "qr_real_321",
    eventId: base.id, paymentId: "pay_000321",
    eventType: "PAYMENT_RECEIVED", state: "paid", amountCents: 500,
  });
});
Deno.test("Pix estatico REAL: externalReference nulo ou de cobrança não é obrigatório", () => {
  assert.equal(parsed({...base, payment: {...base.payment, externalReference: null}})?.cycleId, null);
  assert.equal(parsed({...base, payment: {...base.payment, externalReference: "outra-origem"}})?.cycleId, null);
});
Deno.test("Pix estatico REAL: referencia Elo existente identifica ciclo para checagem adicional", () => {
  assert.equal(parsed({...base, payment: {...base.payment, externalReference: "elo-prod:"+id}})?.cycleId, id);
  assert.equal(parsed({...base, payment: {...base.payment, externalReference: "elo-prod:"+other}})?.cycleId, other);
  assert.equal(parsed({...base, payment: {...base.payment, externalReference: "elo-prod:invalid"}}), null);
});
Deno.test("Pix estatico REAL: QR ausente não confirma oferta", () => {
  for(const qr of [null, "", false, "x"]) {
    assert.equal(parsed({...base, payment: {...base.payment, pixQrCodeId: qr}}), null);
  }
});
Deno.test("Pix estatico REAL: somente cobrança PIX", () => {
  for(const billingType of ["CREDIT_CARD", "BOLETO", null, undefined]) {
    assert.equal(parsed({...base,payment: {...base.payment,billingType}}),null);
  }
});
Deno.test("Pix estatico REAL: valores inválidos, abaixo do mínimo ou arredondados rejeitados", () => {
  for(const value of [1,4.99,5.001,"5", "nan", "", Infinity, NaN, -5]) {
    assert.equal(parsed({...base,payment: {...base.payment,value}}),null,String(value));
  }
});
Deno.test("Pix estatico REAL: estorno, confirmado, criado e exclusão mapeados", () => {
  assert.equal(parsed({...base,event:"PAYMENT_REFUNDED"})?.state,"refunded");
  assert.equal(parsed({...base,event:"PAYMENT_CONFIRMED"})?.state,"paid");
  assert.equal(parsed({...base,event:"PAYMENT_CREATED"})?.state,"pending");
  assert.equal(parsed({...base,event:"PAYMENT_DELETED"})?.state,"canceled");
});
Deno.test("Pix estatico REAL: eventos sem ID ou desconhecidos ignorados", () => {
  assert.equal(parsed({...base,id:null}),null);
  assert.equal(parsed({...base,event:"TRANSFER_DONE"}),null);
  assert.equal(parsed({}),null);
});
Deno.test("Pix estatico REAL: dados pessoais não são copiados para objeto de conciliação", () => {
  const result = parsed({...base,payment:{...base.payment,customer:"cus_privado",
    payerCpfCnpj:"00000000000", externalReference:null}});
  const text = JSON.stringify(result);
  assert.ok(result);
  for(const field of ["customer","payerCpfCnpj","00000000000"]) {
    assert.equal(text.includes(field),false);
  }
});
