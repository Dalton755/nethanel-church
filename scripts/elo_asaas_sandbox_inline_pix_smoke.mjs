#!/usr/bin/env node
// Smoke de QR Pix no Asaas Sandbox. Somente API Sandbox; não paga Pix,
// não usa dados pessoais, não modifica produção nem ofertas das igrejas.
const token=(process.env.ASAAS_SANDBOX_API_KEY || "").trim();
const base="https://api-sandbox.asaas.com/v3";
if(!token.startsWith("$aact_hmlg_")) {
  console.error("Chave Asaas Sandbox ausente ou incorreta. Nenhuma operação executada.");
  process.exit(1);
}
const headers={
  "access_token":token,"accept":"application/json",
  "content-type":"application/json","User-Agent":"Nethanel-Elo-Sandbox-QR-Smoke/1.0",
};
const makeRequest=async(path,method="GET",body)=>{
  const res=await fetch(base+path,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(20000),
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok){
    const desc=String(data.errors?.[0]?.description ?? data.message ?? "Resposta inválida");
    throw new Error(`Asaas Sandbox HTTP ${res.status}: ${desc.slice(0,160)}`);
  }
  return data;
};
let qrId=null;
try{
  const keys=await makeRequest("/pix/addressKeys?status=ACTIVE&limit=20");
  const item=Array.isArray(keys.data) ? keys.data.find(
    k=>k?.status==="ACTIVE" && typeof k?.key==="string" && k.key.length>=8
  ):null;
  if(!item)throw new Error("Nenhuma chave Pix ATIVA no Asaas Sandbox. Cadastre uma chave no painel Asaas Sandbox antes de testar o QR direto no app.");
  const qr=await makeRequest("/pix/qrCodes/static","POST",{
    addressKey:item.key,description:"Simulacao de QR Pix direto no app Nethanel Elo",
    value:5,format:"PAYLOAD",expirationSeconds:600,
    allowsMultiplePayments:false,
    externalReference:`elo-test-qr-${process.env.GITHUB_RUN_ID || "offline"}`,
  });
  if(typeof qr.id!=="string" || typeof qr.payload!=="string" || qr.payload.length<30)
    throw new Error("Asaas não retornou identificador e Pix Copia e Cola válidos.");
  qrId=qr.id;
  // Não imprimir Pix payload nem chave: ambos ficam restritos ao teste.
  console.log("OK: Asaas Sandbox gerou QR Pix único R$ 5 sem cadastro de pagador.");
  console.log("OK: Código Pix Copia e Cola retornado e validado.");
} catch(error) {
  console.error("ASAAS_SANDBOX_INLINE_PIX_ERROR:",error instanceof Error?error.message:String(error));
  process.exitCode=1;
} finally {
  if(qrId){
    const res=await fetch(`${base}/pix/qrCodes/static/${encodeURIComponent(qrId)}`,{
      method:"DELETE",headers,signal:AbortSignal.timeout(12000),
    }).catch(()=>null);
    if(!res?.ok)console.warn("O QR criado para teste não pôde ser desativado automaticamente; ele expira em 10 minutos.");
  }
}
