import { parseRealPixEvent } from "./verify-event.ts";
import { strict as assert } from "node:assert";

const id="b1eac62a-8194-495e-a385-927c84738301";
const base={
 id:"evt_000123",
 event:"PAYMENT_RECEIVED",
 payment:{
   id:"pay_000321",
   pixQrCodeId:"qr_real_321",
   externalReference:"elo-prod:"+id,
   value:5.00,
 },
};
Deno.test("webhook real: Pix de R$5 completo é identificado sem registrar dados pessoais",()=>{
 const parsed=parseRealPixEvent(base);
 assert.deepEqual(parsed,{
  cycleId:id,qrId:"qr_real_321",eventId:"evt_000123",
  paymentId:"pay_000321",eventType:"PAYMENT_RECEIVED",
  state:"paid",amountCents:500,
 });
 assert.equal(JSON.stringify(parsed).includes("customer"),false);
});
Deno.test("webhook real: reconhece evento de estorno sem tomar ação na rede",()=>{
 const x=parseRealPixEvent({...base,event:"PAYMENT_REFUNDED"});
 assert.equal(x?.state,"refunded");
});
Deno.test("webhook real: ausência de QR não vincula recebimento",()=>{
 const x=parseRealPixEvent({...base,payment:{...base.payment,pixQrCodeId:null}});
 assert.equal(x,null);
});
Deno.test("webhook real: referência externa não Elo é rejeitada",()=>{
 const x=parseRealPixEvent({...base,payment:{...base.payment,externalReference:"elo-monthly:"+id}});
 assert.equal(x,null);
});
Deno.test("webhook real: referência de ciclo inválido é rejeitada",()=>{
 const x=parseRealPixEvent({...base,payment:{...base.payment,externalReference:"elo-prod:bad"}});
 assert.equal(x,null);
});
Deno.test("webhook real: valores abaixo de R$5 e com precisão incorreta são rejeitados",()=>{
 for(const value of [1,4.99,5.001,"nan","",Infinity]){
  const x=parseRealPixEvent({...base,payment:{...base.payment,value}});
  assert.equal(x,null,String(value));
 }
});
Deno.test("webhook real: evento sem id ou desconhecido não é conciliado",()=>{
 assert.equal(parseRealPixEvent({...base,id:null}),null);
 assert.equal(parseRealPixEvent({...base,event:"TRANSFER_DONE"}),null);
});
Deno.test("webhook real: não confunde Pix pago com pagamento em aberto",()=>{
 assert.equal(parseRealPixEvent({...base,event:"PAYMENT_UPDATED"})?.state,"pending");
 assert.equal(parseRealPixEvent({...base,event:"PAYMENT_CONFIRMED"})?.state,"paid");
});
