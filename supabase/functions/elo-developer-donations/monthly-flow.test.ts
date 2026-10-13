import { getOrCreateMonthlyPix, cancelMonthlyManualPix } from "./monthly-flow.ts";
const check=(value:unknown,message:string)=>{if(!value)throw new Error(message)};
const user=(reservation:unknown)=>({
  rpc:async (name:string,args:any)=>{
    check(name==="reserve_elo_monthly_pix_cycle","RPC não autorizada");
    check(args?.p_donation_id==="148cd434-6dd5-4d64-9fd3-66080f40bc21","identificador incorreto");
    return {data:reservation,error:null};
  },
});
const id="148cd434-6dd5-4d64-9fd3-66080f40bc21";
const date="2026-10-01";

Deno.test("mensal: período já pago não cria novo QR",async()=>{
 const result=await getOrCreateMonthlyPix(user({
  state:"paid",cycleId:"1b08f4b8-aa3d-4ad9-b7b3-832e6a9d31d3",
  month:date,amountCents:500,
 }),{}, "$aact_hmlg_test_only",id);
 check(result.ok && result.alreadyPaid,"pagamento existente foi ignorado");
 check(!("pixPayload" in result),"QR novo foi indevidamente gerado");
});
Deno.test("mensal: período pendente reutiliza o mesmo QR",async()=>{
 const result=await getOrCreateMonthlyPix(user({
  state:"pending",cycleId:"1b08f4b8-aa3d-4ad9-b7b3-832e6a9d31d3",
  month:date,amountCents:500,pixPayload:"PIX_COPIA_COLA_SOMENTE_DADOS_DE_TESTE",
  expiresAt:"2026-10-14T10:00:00Z",
 }),{}, "$aact_hmlg_test_only",id);
 check(result.ok && result.reused,"QR anterior não foi reutilizado");
 check(result.pixPayload==="PIX_COPIA_COLA_SOMENTE_DADOS_DE_TESTE","conteúdo alterado");
});
Deno.test("mensal: oferta cancelada não pode gerar novo QR",async()=>{
 const result=await getOrCreateMonthlyPix(user({state:"canceled"}),{},
   "$aact_hmlg_test_only",id);
 check(result.ok===false && !("pixPayload" in result),"QR gerado após cancelar");
});
Deno.test("mensal: geração concorrente avisa sem criar duplicidade",async()=>{
 const result=await getOrCreateMonthlyPix(user({state:"processing"}),{},
   "$aact_hmlg_test_only",id);
 check(result.ok===false && !("pixPayload" in result),"gerou QR concorrente");
});

Deno.test("cancelamento mensal impede gerações futuras sem transação financeira",async()=>{
  let called=false;
  const auth={rpc:async(name:string,args:any)=>{
    check(name==="cancel_elo_monthly_pix_pledge","Chamada de cancelamento incorreta");
    check(args?.p_donation_id===id,"ID trocado");
    called=true;
    return {data:{canceled:true,alreadyCanceled:false,qrIds:[]},error:null};
  }};
  const result=await cancelMonthlyManualPix(auth,"$aact_hmlg_test_only",{
    id,organization_id:"101212c5-6e81-4915-ae9a-fbde5b42bb04",
    environment:"sandbox",frequency:"monthly",payment_method:"pix",checkout_url:null,
  });
  check(called && result.ok && result.canceled,
    "Cancelamento da intenção mensal não confirmado");
});

Deno.test("cancelamento não pode afetar igreja fora da Demo",async()=>{
  const auth={rpc:async()=>{throw new Error("Não deveria chamar RPC");}};
  const result=await cancelMonthlyManualPix(auth,"$aact_hmlg_test_only",{
    id,organization_id:"00000000-0000-4000-8000-000000000001",
    environment:"sandbox",frequency:"monthly",payment_method:"pix",checkout_url:null,
  });
  check(!result.ok,"Outra igreja foi aceita");
});
