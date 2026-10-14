// Motor FUTURO do webhook REAL. Não importado pelo index.ts desativado.
// ATENÇÃO: não cadastrar esta URL no Asaas até teste autorizado de ponta a ponta.
import { createClient } from "@supabase/supabase-js";
import { parseRealPixEvent } from "./verify-event.ts";

const DEMO = "101212c5-6e81-4915-ae9a-fbde5b42bb04";
const reply=(status:number,fields:Record<string,unknown>)=>
  new Response(JSON.stringify(fields),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
  }});

export async function secureTokenEquals(left:string,right:string):Promise<boolean> {
  const enc=new TextEncoder();
  const [a,b]=await Promise.all([
    crypto.subtle.digest("SHA-256",enc.encode(left)),
    crypto.subtle.digest("SHA-256",enc.encode(right)),
  ]);
  const aa=new Uint8Array(a),bb=new Uint8Array(b);
  let difference=0;
  for(let i=0;i<aa.length;i++)difference|=aa[i]^bb[i];
  return difference===0;
}

export async function handleAuthorizedProductionWebhook(request:Request):Promise<Response> {
  // Defesa adicional mesmo no motor importado posteriormente por engano.
  if(Deno.env.get("ELO_DONATIONS_PRODUCTION_ENABLED")!=="true")
    return reply(503,{ok:false,code:"production_locked"});
  if(request.method!=="POST")
    return reply(405,{ok:false,code:"method_not_allowed"});

  const expected=(Deno.env.get("ELO_ASAAS_PRODUCTION_WEBHOOK_TOKEN")??"").trim();
  if(expected.length<32 || expected.length>255 || /\s/.test(expected) ||
     expected.startsWith("$aact_"))
    return reply(503,{ok:false,code:"webhook_not_configured"});
  const received=request.headers.get("asaas-access-token")??"";
  if(received.length===0||received.length>255||!(await secureTokenEquals(expected,received)))
    return reply(401,{ok:false,code:"invalid_token"});
  if(Number(request.headers.get("content-length")??0)>32768)
    return reply(413,{ok:false,code:"payload_too_large"});

  let raw:string;
  try{raw=await request.text();}catch{return reply(400,{ok:false,code:"invalid_body"});}
  if(raw.length>32768)return reply(413,{ok:false,code:"payload_too_large"});
  let body:unknown;
  try{body=JSON.parse(raw);}catch{return reply(400,{ok:false,code:"invalid_json"});}
  const parsed=parseRealPixEvent(body);
  if(!parsed)return reply(200,{ok:true,ignored:true});

  const base=Deno.env.get("SUPABASE_URL")??"";
  const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!base||!secret)return reply(503,{ok:false,code:"storage_not_ready"});
  const db=createClient(base,secret,
    {auth:{persistSession:false,autoRefreshToken:false}});

  const {data:cycle,error:cycleError}=await db.from("elo_prod_pix_cycles")
    .select("id,intent_id,provider_qr_id,amount_cents,state,provider_payment_id")
    .eq("id",parsed.cycleId).maybeSingle();
  if(cycleError)return reply(500,{ok:false,code:"database_unavailable"});
  if(!cycle)return reply(200,{ok:true,ignored:true});
  const {data:intent,error:intentError}=await db.from("elo_prod_offering_intents")
    .select("organization_id").eq("id",cycle.intent_id)
    .eq("organization_id",DEMO).maybeSingle();
  if(intentError)return reply(500,{ok:false,code:"database_unavailable"});
  if(!intent || cycle.provider_qr_id!==parsed.qrId ||
     cycle.amount_cents!==parsed.amountCents)
    return reply(422,{ok:false,code:"payment_not_matching"});
  if(cycle.provider_payment_id && cycle.provider_payment_id!==parsed.paymentId)
    return reply(422,{ok:false,code:"payment_id_conflict"});

  const {data:stored,error:saveError}=await db.rpc("record_elo_prod_pix_event",{
    p_cycle_id:parsed.cycleId,p_qr_id:parsed.qrId,
    p_event_id:parsed.eventId,p_payment_id:parsed.paymentId,
    p_event_type:parsed.eventType,p_state:parsed.state,
    p_amount_cents:parsed.amountCents,
  });
  if(saveError){
    console.error("Elo real webhook event reconciliation failed",saveError.code);
    return reply(500,{ok:false,code:"save_failed"});
  }
  return reply(200,{ok:true,stored:stored===true,duplicate:stored===false});
}
