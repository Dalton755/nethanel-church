import { parseSandboxPixEvent } from "./parse-event.ts";
const expect=(ok:unknown,msg:string) => {if(!ok)throw new Error(msg)};
const sample=(event="PAYMENT_CREATED",payment:Record<string,unknown>={})=>({
 id:"evt_051234567890",event,
 payment: {
   id:"pay_051234567890",
   paymentLink:"link_051234567890",
   externalReference:"elo-test-donation-38325801777",
   value:5,
   ...payment,
 },
});

Deno.test("Pix Sandbox R$5 aguardando registro",()=>{
 const parsed=parseSandboxPixEvent(sample());
 expect(parsed?.state==="pending","estado incorreto");
 expect(parsed?.amount_cents===500,"valor incorreto");
 expect(parsed?.reference_label==="elo-test-donation-38325801777","referencia incorreta");
});

Deno.test("Sandbox recebeu pagamento simulado",()=>{
 const parsed=parseSandboxPixEvent(sample("PAYMENT_RECEIVED"));
 expect(parsed?.state==="confirmed","pagamento confirmado nao reconhecido");
});

Deno.test("repeticao do mesmo evento gera ID idempotente",()=>{
 const first=parseSandboxPixEvent(sample("PAYMENT_RECEIVED"));
 const second=parseSandboxPixEvent(sample("PAYMENT_RECEIVED"));
 expect(first?.event_id===second?.event_id,"chave de deduplicacao instavel");
});

Deno.test("estorno reconhecido sem liberar recursos",()=>{
 const parsed=parseSandboxPixEvent(sample("PAYMENT_REFUNDED"));
 expect(parsed?.state==="refunded","evento de estorno perdido");
 expect(!("organization_id" in (parsed??{})),"nao pode alterar igreja");
});

Deno.test("ignorar valores diferentes de cinco reais",()=>{
 expect(parseSandboxPixEvent(sample("PAYMENT_RECEIVED",{value:50}))===null,"valor fora do teste");
});

Deno.test("ignorar eventos sem identificador de link",()=>{
 expect(parseSandboxPixEvent(sample("PAYMENT_RECEIVED",{paymentLink:null}))===null,"cobranca sem link aceita");
});

Deno.test("ignorar eventos sem payment",()=>{
 expect(parseSandboxPixEvent({id:"evt_051234567890",event:"PAYMENT_RECEIVED"})===null,"evento invalido aceito");
});

Deno.test("ignorar eventos que nao sejam pagamentos",()=>{
 expect(parseSandboxPixEvent({...sample(),event:"SUBSCRIPTION_CREATED"})===null,"assinatura indevidamente aceita");
});

Deno.test("nao armazenar campos pessoais da cobranca",()=>{
 const parsed=parseSandboxPixEvent(sample("PAYMENT_RECEIVED",{
   customer:"cus_000123",customerEmail:"pessoa@dominio.test",creditCard:"123",
 }));
 expect(parsed&&!JSON.stringify(parsed).includes("pessoa@dominio.test"),"vazamento de dados pessoais");
});

Deno.test("nao armazenar referencia arbitraria",()=>{
 const parsed=parseSandboxPixEvent(sample("PAYMENT_RECEIVED",{externalReference:"dado@privado.com"}));
 expect(parsed?.reference_label===null,"informacoes arbitrarias foram persistidas");
});
