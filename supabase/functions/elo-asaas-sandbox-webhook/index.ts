import { createClient } from "@supabase/supabase-js";
import { parseSandboxPixEvent } from "./parse-event.ts";
import { DONATION_PAYMENT_EVENTS, prepareDonationEvent, type DonationRecord } from "./payment-event.ts";

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
  const incoming = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown> : {};
  const eventName = String(incoming.event ?? "");
  const payment = incoming.payment && typeof incoming.payment === "object"
    ? incoming.payment as Record<string, unknown> : null;
  const paymentLink = typeof payment?.paymentLink === "string" ? payment.paymentLink : null;
  const subscriptionId = typeof payment?.subscription === "string" ? payment.subscription : null;
  const pixQrCodeId = typeof payment?.pixQrCodeId === "string" ? payment.pixQrCodeId : null;
  const extref = typeof payment?.externalReference === "string" ?
    payment.externalReference : "";
  const refId = /^elo-donation:([0-9a-f-]{36})$/i.exec(extref)?.[1] ?? null;
  const monthlyRefId = /^elo-monthly:([0-9a-f-]{36})$/i.exec(extref)?.[1] ?? null;

  const receipt=parseSandboxPixEvent(body);
  // Demais eventos são ignorados antes de sequer abrir conexão com o banco.
  if (!receipt && (!payment || !Object.hasOwn(DONATION_PAYMENT_EVENTS, eventName) ||
      (!paymentLink && !subscriptionId && !refId && !pixQrCodeId && !monthlyRefId))) return reply({ok:true,ignored:true});

  const base=Deno.env.get("SUPABASE_URL") ?? "";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if(!base || !key) return reply({ok:false,message:"Armazenamento indisponível."},503);

  const db=createClient(base,key,{auth:{persistSession:false}});

  // Novas ofertas da igreja DEMO: valor livre >= R$ 5 e recorrência.
  // Evita interceptar outros pagamentos Asaas e preserva o antigo teste Pix.
  const DEMO_ORG_ID="101212c5-6e81-4915-ae9a-fbde5b42bb04";

  // Pix mensal manual: o QR de CADA mês tem seu próprio identificador.
  // O vínculo com a oferta é verificado antes da conciliação.
  if(payment && Object.hasOwn(DONATION_PAYMENT_EVENTS,eventName) &&
      (monthlyRefId || pixQrCodeId)) {
    const selectors: {field:string;value:string}[] = [];
    if(monthlyRefId) selectors.push({field:"id",value:monthlyRefId});
    if(pixQrCodeId) selectors.push({field:"provider_qr_id",value:pixQrCodeId});
    let cycle:Record<string,any>|null=null;
    for(const target of selectors){
      const {data,error}=await db.from("elo_developer_monthly_pix_cycles")
        .select("id,donation_id,provider_qr_id,amount_cents,status")
        .eq(target.field,target.value).maybeSingle();
      if(error) return reply({ok:false,message:"Erro ao localizar Pix mensal."},500);
      if(data){cycle=data;break;}
    }
    if(cycle){
      // Bloqueio de eventos que misturam QR de um mês com a referência de outro.
      if((monthlyRefId && cycle.id !== monthlyRefId) ||
          (pixQrCodeId && cycle.provider_qr_id !== pixQrCodeId))
        return reply({ok:false,message:"Identificação do período Pix inválida."},422);
      const {data:d,error:dError}=await db.from("elo_developer_donations")
        .select("id,amount_cents,environment,frequency,payment_link_id,provider_subscription_id")
        .eq("id",cycle.donation_id).eq("organization_id",DEMO_ORG_ID)
        .eq("environment","sandbox").eq("frequency","monthly")
        .eq("payment_method","pix").is("checkout_url",null).maybeSingle();
      if(dError || !d)return reply({ok:false,message:"Oferta mensal não localizada."},422);
      let v;
      try{
        v=prepareDonationEvent(body,{
          ...(d as DonationRecord),provider_pix_qr_id:cycle.provider_qr_id,
          provider_monthly_cycle_id:cycle.id,
        },"sandbox");
        if(v && v.amount_cents !== cycle.amount_cents)
          throw new Error("Valor do mês divergente");
      }catch{
        return reply({ok:false,message:"Evento de Pix mensal inválido."},422);
      }
      if(!v)return reply({ok:true,ignored:true});
      const {error}=await db.rpc("elo_apply_developer_monthly_pix_event",{
        p_cycle_id:cycle.id,p_event_key:v.event_key,
        p_provider_payment_id:v.provider_payment_id,
        p_status:v.status,p_amount_cents:v.amount_cents,
      });
      if(error){
        console.error("Falha de conciliação do Pix mensal",error.code);
        return reply({ok:false,message:"Falha ao conciliar Pix mensal."},500);
      }
      console.log("Elo Sandbox: Pix mensal conciliado",{
        type:eventName,status:v.status,
      });
      return reply({ok:true,monthly:true});
    }
  }
  let donation: DonationRecord | null = null;
  if (payment && Object.hasOwn(DONATION_PAYMENT_EVENTS, eventName)) {
    const filters: {column: string; value: string}[] = [];
    if (paymentLink) filters.push({column:"payment_link_id",value:paymentLink});
    if (subscriptionId) filters.push({column:"provider_subscription_id",value:subscriptionId});
    if (pixQrCodeId) filters.push({column:"provider_pix_qr_id",value:pixQrCodeId});
    if (refId) filters.push({column:"id",value:refId});
    for (const filter of filters) {
      const {data,error} = await db.from("elo_developer_donations")
        .select("id,amount_cents,environment,frequency,payment_link_id,provider_subscription_id,provider_pix_qr_id")
        .eq("organization_id",DEMO_ORG_ID).eq("environment","sandbox")
        .eq(filter.column,filter.value).maybeSingle();
      if(error) {
        console.error("Falha ao localizar oferta Sandbox",error.code);
        return reply({ok:false,message:"Falha ao buscar oferta."},500);
      }
      if (data) { donation=data as DonationRecord; break; }
    }
  }
  if (donation) {
    let validated;
    try {
      validated=prepareDonationEvent(body,donation,"sandbox");
    } catch {
      return reply({ok:false,message:"Evento da oferta nao corresponde ao registro."},422);
    }
    if (!validated) return reply({ok:true,ignored:true});

    const {error} = await db.rpc("elo_apply_developer_donation_event",{
      p_donation_id:validated.donation_id,
      p_event_key:validated.event_key,
      p_provider_payment_id:validated.provider_payment_id,
      p_status:validated.status,
      p_amount_cents:validated.amount_cents,
      p_provider_subscription_id:validated.provider_subscription_id,
    });
    if (error) {
      console.error("Falha ao registrar evento de oferta Sandbox",error.code);
      return reply({ok:false,message:"Falha ao conciliar oferta."},500);
    }
    // Nunca desativa assinatura mensal automaticamente; a igreja escolhe cancelar.
    console.log("Elo Sandbox: oferta reconciliada",{
      type:eventName,status:validated.status,
    });
    return reply({ok:true,donation:true});
  }

  if(!receipt) return reply({ok:true,ignored:true});
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
