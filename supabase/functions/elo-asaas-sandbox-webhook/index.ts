import { createClient } from "@supabase/supabase-js";
import { parseSandboxPixEvent } from "./parse-event.ts";

const reply = (payload: Record<string, unknown>, status=200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

async function secureEquals(expected: string, actual: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a,b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
    crypto.subtle.digest("SHA-256", enc.encode(actual)),
  ]);
  const left=new Uint8Array(a);
  const right=new Uint8Array(b);
  let diff=0;
  for(let i=0;i<left.length;i++) diff |= left[i]^right[i];
  return diff===0;
}

Deno.serve(async (request) => {
  if(request.method!=="POST") return reply({ok:false,message:"Método não permitido."},405);

  // Um segredo exclusivo precisa ser definido no Supabase e no webhook do
  // Asaas Sandbox. Se não estiver definido, o endpoint permanece INOPERANTE.
  // Não usa o token das assinaturas nem a API Key financeira da produção.
  const secret = (Deno.env.get("ELO_ASAAS_SANDBOX_WEBHOOK_TOKEN") ?? "").trim();
  if(secret.length < 32 || secret.length > 255)
    return reply({ok:false,message:"Webhook Sandbox aguardando ativação."},503);

  const supplied=(request.headers.get("asaas-access-token") ?? "").trim();
  if(!supplied || supplied.length>255 || !(await secureEquals(secret,supplied))) {
    return reply({ok:false,message:"Não autorizado."},401);
  }

  // Asaas não necessita enviar dados pessoais para conciliar o evento.
  if(Number(request.headers.get("content-length") ?? 0)>32768)
    return reply({ok:false,message:"Payload excede o limite."},413);

  let body: unknown;
  try {
    const raw=await request.text();
    if(raw.length>32768) return reply({ok:false,message:"Payload excede o limite."},413);
    body=JSON.parse(raw);
  } catch {
    return reply({ok:false,message:"JSON inválido."},400);
  }
  const receipt=parseSandboxPixEvent(body);
  if(!receipt) return reply({ok:true,ignored:true});

  const base=Deno.env.get("SUPABASE_URL") ?? "";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if(!base || !key) return reply({ok:false,message:"Armazenamento indisponível."},503);

  const db=createClient(base,key,{auth:{persistSession:false}});
  const {error}=await db.from("elo_asaas_sandbox_webhook_receipts")
    .insert(receipt);
  if(error?.code==="23505") return reply({ok:true,duplicate:true});
  if(error) {
    // Nunca registrar payload completo, CPF/CNPJ, token ou cartão.
    console.error("Elo Sandbox Webhook: erro de persistência",error.code);
    return reply({ok:false,message:"Falha ao registrar evento de teste."},500);
  }
  console.log("Elo Sandbox Webhook: evento de teste registrado", {
    type:receipt.event_type, state:receipt.state,
  });
  return reply({ok:true,stored:true});
});
