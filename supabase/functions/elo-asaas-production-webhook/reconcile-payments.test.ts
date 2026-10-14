import { planMissingPixWebhook } from "./reconcile-payments.ts";
import { strict as assert } from "node:assert";
// Todos os dados são fixtures. Sem rede, credenciais ou acesso ao Asaas real.
const cycle = {
  id: "b1eac62a-8194-495e-a385-927c84738301",
  providerQrId: "qr_real_mock_321",
  amountCents: 500,
};
const payment = {
  id: "pay_mock_000321", pixQrCodeId: cycle.providerQrId,
  billingType: "PIX", status: "RECEIVED", value: 5.00,
  externalReference: null,
};
const response = (data: unknown[], hasMore = false) => ({hasMore, data});

Deno.test("reconciliação: webhook perdido recupera pagamento recebido por QR, sem referencia", async () => {
  const planned = await planMissingPixWebhook(cycle, response([payment]));
  assert.equal(planned.kind,"recover");
  if(planned.kind !== "recover") return;
  assert.equal(planned.events.length,1);
  assert.deepEqual(planned.events[0].state,"paid");
  assert.equal(planned.events[0].amountCents,500);
  assert.equal(planned.events[0].qrId,cycle.providerQrId);
});
Deno.test("reconciliação: rodar duas vezes produz o MESMO ID, evitando duplicação", async () => {
  const a = await planMissingPixWebhook(cycle,response([payment]));
  const b = await planMissingPixWebhook(cycle,response([payment]));
  assert.deepEqual(a,b);
  if(a.kind==="recover") assert.match(a.events[0].eventId,/^recon:[a-f0-9]{64}$/);
});
Deno.test("reconciliação: estorno sem webhook gera sequência pago + estornado idempotente",async()=>{
  const p = await planMissingPixWebhook(cycle,response([{...payment,status:"REFUNDED"}]));
  assert.equal(p.kind,"recover");
  if(p.kind!=="recover")return;
  assert.deepEqual(p.events.map(e=>e.state),["paid","refunded"]);
  assert.notEqual(p.events[0].eventId,p.events[1].eventId);
});
Deno.test("reconciliação: múltiplos pagamentos para QR de uso único exige revisão humana",async()=>{
  const p=await planMissingPixWebhook(cycle,response([payment,{...payment,id:"pay_mock_002"}]));
  assert.deepEqual(p,{kind:"manual_review",reason:"multiple_receipts"});
});
Deno.test("reconciliação: segundo lote incompleto não deve conciliar",async()=>{
  assert.deepEqual(await planMissingPixWebhook(cycle,response([payment],true)),
    {kind:"manual_review",reason:"incomplete_page"});
});
Deno.test("reconciliação: Pix de outro QR e ausência de pagamento ficam sem efeito",async()=>{
  const another=await planMissingPixWebhook(cycle,response([{...payment,pixQrCodeId:"qr_outro_999"}]));
  assert.deepEqual(another,{kind:"none"});
  assert.deepEqual(await planMissingPixWebhook(cycle,response([])),{kind:"none"});
});
Deno.test("reconciliação: valor ou forma de pagamento diferentes exigem revisão",async()=>{
  for(const p of [{...payment,value:50},{...payment,billingType:"BOLETO"},
    {...payment,id:null},{...payment,value:5.001}]) {
    const x=await planMissingPixWebhook(cycle,response([p]));
    assert.deepEqual(x,{kind:"manual_review",reason:"payment_mismatch"});
  }
});
Deno.test("reconciliação: pagamento pendente não é marcado como recebido",async()=>{
  assert.deepEqual(await planMissingPixWebhook(cycle,response([{...payment,status:"PENDING"}])),
    {kind:"none"});
});
Deno.test("reconciliação: dados pessoais não entram no evento de recuperação",async()=>{
  const x=await planMissingPixWebhook(cycle,response([{...payment,
    customer:"cus_privado",cpfCnpj:"00000000000"}]));
  const str=JSON.stringify(x);
  assert.ok(!str.includes("cus_privado"));
  assert.ok(!str.includes("00000000000"));
});
