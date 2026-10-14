// Motor FUTURO (não carregado pelo index.ts desativado).
// Integração real requer banco de prévia aplicado + nova autorização explícita.
import { createClient } from "@supabase/supabase-js";
import { createProductionPix, revokeProductionPix } from "./pix-provider.ts";

const DEMO = "101212c5-6e81-4915-ae9a-fbde5b42bb04";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond = (status: number, data: Record<string, unknown>) =>
  new Response(JSON.stringify({ ...data, environment: "production" }), {
    status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
  });

type Client = any; // Supabase RPCs ainda não foram aplicadas ao banco; tipar após a migração.
async function prepareCycle(user: Client, admin: Client, key: string, intentId: string) {
  const { data, error } = await user.rpc("reserve_elo_prod_pix_cycle", {
    p_intent_id: intentId,
  });
  if (error || !data?.state) return {
    ok: false, code: "cycle_not_available",
    message: "Não foi possível reservar o Pix para esta oferta.",
  };
  if (data.state === "paid" || data.state === "refunded")
    return { ok: true, alreadyPaid: true, id: intentId, cycleId: data.cycleId,
      month: data.month, state: data.state };
  if (data.state === "canceled")
    return { ok: false, code:"canceled",message:"Esta oferta foi cancelada." };
  if (data.state === "pending" && typeof data.pixPayload === "string")
    return { ok: true, id: intentId, cycleId: data.cycleId, month: data.month,
      amountCents: data.amountCents, pixPayload: data.pixPayload,
      expiresAt: data.expiresAt, reused: true };
  if (data.state === "processing")
    return {ok:false,code:"processing",message:"Pix em preparação. Tente novamente mais tarde."};
  if (data.state !== "new" || typeof data.cycleId !== "string" ||
      !uuid.test(data.cycleId) || !Number.isInteger(data.amountCents))
    return {ok:false,code:"invalid_cycle",message:"Não foi possível preparar a oferta."};

  let generated: Awaited<ReturnType<typeof createProductionPix>> | null = null;
  try {
    generated = await createProductionPix(key, data.amountCents, data.cycleId);
    const {data: stored, error: saveError} = await admin.rpc("commit_elo_prod_pix_qr", {
      p_intent_id: intentId,p_cycle_id:data.cycleId,
      p_provider_qr_id:generated.id,p_payload:generated.payload,
      p_expires_at:generated.expiresAt,
    });
    if (saveError || stored !== true) {
      await revokeProductionPix(key, generated.id);
      return {ok:false,code:"not_saved",message:"Pix não confirmado no servidor."};
    }
    return {ok:true,id:intentId,cycleId:data.cycleId,month:data.month,
      amountCents:data.amountCents,pixPayload:generated.payload,
      expiresAt:generated.expiresAt};
  } catch {
    // A chave/código Pix nunca é colocado nos logs ou na exceção ao cliente.
    if (generated) await revokeProductionPix(key,generated.id);
    await admin.from("elo_prod_pix_cycles")
      .update({state:"failed",updated_at:new Date().toISOString()})
      .eq("id",data.cycleId).eq("state","processing");
    return {ok:false,code:"provider_error",message:"Não foi possível gerar o Pix."};
  }
}

export async function handleAuthorizedProductionOffering(request: Request): Promise<Response> {
  // Dupla barreira: esta função não é importada pelo index.ts atual.
  // Mesmo futuramente, o envio de cobranças precisa de habilitação expressa.
  if (Deno.env.get("ELO_DONATIONS_PRODUCTION_ENABLED") !== "true")
    return respond(503,{ok:false,code:"production_locked"});

  if (request.method !== "POST") return respond(405,{ok:false,code:"method_not_allowed"});
  const bearer=request.headers.get("Authorization") ?? "";
  if (!bearer.startsWith("Bearer ")) return respond(401,{ok:false,code:"sign_in"});
  const supabaseUrl=Deno.env.get("SUPABASE_URL") ?? "";
  const anon=Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key=Deno.env.get("ELO_ASAAS_PRODUCTION_API_KEY") ?? "";
  if (!supabaseUrl || !anon || !service || !key.startsWith("$aact_prod_"))
    return respond(503,{ok:false,code:"server_not_ready"});

  const user=createClient(supabaseUrl,anon,{global:{headers:{Authorization:bearer}},
    auth:{persistSession:false,autoRefreshToken:false}});
  const {data:verify,error:verifyError}=await user.auth.getUser();
  if (verifyError || !verify.user) return respond(401,{ok:false,code:"unauthorized"});
  const admin=createClient(supabaseUrl,service,
    {auth:{persistSession:false,autoRefreshToken:false}});
  const {data:allowed,error:adminError}=await admin.from("platform_admins")
    .select("user_id").eq("user_id",verify.user.id).eq("active",true).maybeSingle();
  if (adminError || !allowed) return respond(403,{ok:false,code:"not_platform_admin"});

  let body: Record<string, unknown>;
  try {
    const raw=await request.text();
    if(raw.length>4096) return respond(413,{ok:false,code:"too_large"});
    const parsed=JSON.parse(raw);
    if (!parsed || typeof parsed!=="object" || Array.isArray(parsed))
      return respond(400,{ok:false,code:"bad_body"});
    body=parsed;
  } catch {return respond(400,{ok:false,code:"bad_body"});}

  if (body.action==="list") {
    const {data,error}=await user.rpc("list_my_elo_prod_offerings",{p_org:DEMO});
    return error ? respond(403,{ok:false,code:"cannot_list"}) :
      respond(200,{ok:true,offerings:data ?? []});
  }
  if (body.action==="cancel") {
    const id=typeof body.id==="string" ? body.id : "";
    if (!uuid.test(id))return respond(400,{ok:false,code:"invalid_id"});
    const {data:closed,error}=await user.rpc("cancel_elo_prod_monthly",{p_intent_id:id});
    if (error || !closed?.canceled) return respond(403,{ok:false,code:"cancel_denied"});
    let revocationPending=false;
    for (const code of Array.isArray(closed.qrIds) ? closed.qrIds : []) {
      if (typeof code==="string" && !(await revokeProductionPix(key,code)))
        revocationPending=true;
    }
    return respond(200,{ok:true,canceled:true,alreadyCanceled:Boolean(closed.alreadyCanceled),
      warning:revocationPending ?
        "Oferta cancelada, mas um Pix emitido pode permanecer pagável até expirar." : null});
  }
  if (body.action==="monthly_pix") {
    const id=typeof body.id==="string" ? body.id : "";
    if(!uuid.test(id))return respond(400,{ok:false,code:"invalid_id"});
    const result=await prepareCycle(user,admin,key,id);
    return respond(result.ok ? 200 : 409,result);
  }
  if (body.action !== "create")
    return respond(400,{ok:false,code:"unsupported_action"});
  const frequency=body.frequency;
  const cents=body.amountCents;
  if(body.organizationId!==DEMO || !Number.isInteger(cents) ||
     (cents as number)<500 || (cents as number)>5_000_000 ||
     !["once","monthly"].includes(String(frequency))) {
    return respond(403,{ok:false,code:"pilot_demo_only"});
  }
  const {data:intent,error}=await user.rpc("request_elo_prod_offering",{
    p_organization_id:DEMO,p_amount_cents:cents,p_frequency:frequency,
  });
  if(error || !uuid.test(String(intent?.id??"")))
    return respond(403,{ok:false,code:"cannot_create"});
  const result=await prepareCycle(user,admin,key,intent.id);
  return respond(result.ok ? 200 : 409,result);
}
