import { createClient } from "@supabase/supabase-js";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const DEMO_ORG_ID = "101212c5-6e81-4915-ae9a-fbde5b42bb04";
const expectedMethods = new Set(["pix", "card", "boleto"]);
const expectedFrequency = new Set(["once", "monthly"]);

function trustedAsaasLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      (u.hostname === "asaas.com" || u.hostname.endsWith(".asaas.com"));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, message: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // HOMOLOGACAO: nunca reutiliza a chave de producao das assinaturas.
  // Mesmo com variaveis antigas apontando para live, o destino e SEMPRE Sandbox.
  const asaasKey = (Deno.env.get("ELO_ASAAS_SANDBOX_API_KEY") ?? "").trim();
  const base = SANDBOX_URL;
  const environment = "sandbox";
  const configured = asaasKey.startsWith("$aact_hmlg_");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ ok: false, message: "Integração indisponível." }, 503);


  const token = req.headers.get("Authorization") ?? "";
  if (!token.startsWith("Bearer ")) return json({ ok: false, message: "Entre na sua conta." }, 401);
  const user = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: token } } });
  const { data: userInfo, error: userError } = await user.auth.getUser();
  if (userError || !userInfo.user) return json({ ok: false, message: "Acesso não autorizado." }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ ok: false, message: "Requisição inválida." }, 400); }

  if (body.action === "capabilities") {
    return json({ ok: true, configured,
      sandbox: true, productionEnabled: false, demoOrganizationId: DEMO_ORG_ID,
      methods: ["pix", "card", "boleto"], frequency: ["once", "monthly"] });
  }

  if (!configured) return json({ ok: false,
    message: "Chave do Asaas Sandbox ainda não configurada no Supabase." }, 503);

  // Leitura segura do Pix criado anteriormente. Nunca expõe chaves de API.
  if (body.action === "pix") {
    const donationId = typeof body.id === "string" ? body.id : "";
    if (!/^[a-f0-9-]{36}$/i.test(donationId))
      return json({ ok:false, message:"Identificador de oferta inválido." },400);
    const { data: list, error: listError } = await user.rpc(
      "list_my_elo_developer_donations", { p_organization_id: DEMO_ORG_ID },
    );
    if (listError || !Array.isArray(list) || !list.some((row: any) => row.id === donationId))
      return json({ok:false,message:"Sem acesso a esta oferta."},403);
    const { data:d, error } = await admin.from("elo_developer_donations")
      .select("id,status,amount_cents,payment_method,frequency,environment,organization_id,requested_by,pix_payload,pix_expires_at")
      .eq("id",donationId).eq("organization_id",DEMO_ORG_ID)
      .eq("requested_by",userInfo.user.id).eq("environment","sandbox")
      .maybeSingle();
    if(error || !d || d.payment_method !== "pix" || d.frequency !== "once" || !d.pix_payload)
      return json({ok:false,message:"Pix de teste não encontrado."},404);
    if(d.pix_expires_at && Date.parse(d.pix_expires_at) < Date.now() && d.status !== "paid")
      return json({ok:false,message:"Este Pix expirou. Gere uma nova oferta."},410);
    return json({ok:true,sandbox:true,id:d.id,status:d.status,
      amountCents:d.amount_cents,pixPayload:d.pix_payload,expiresAt:d.pix_expires_at});
  }

  if (body.action === "cancel") {
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id))
      return json({ ok: false, message: "Identificador inválido." }, 400);

    const { data: donations, error: donationError } = await admin.from("elo_developer_donations")
      .select("*").eq("id", body.id).eq("requested_by", userInfo.user.id)
      .eq("frequency", "monthly").limit(1);
    const d = donations?.[0];
    if (donationError || !d || d.organization_id !== DEMO_ORG_ID ||
        d.environment !== "sandbox") {
      return json({ ok: false, message: "Oferta mensal de teste não localizada." }, 404);
    }
    if (d.status === "canceled") return json({ ok: true, alreadyCanceled: true });

    const can = await user.rpc("list_my_elo_developer_donations", { p_organization_id: d.organization_id });
    if (can.error || !Array.isArray(can.data) || !can.data.some((x: any) => x.id === d.id))
      return json({ ok: false, message: "Sem permissão para cancelar." }, 403);

    if (!d.provider_subscription_id)
      return json({ ok: false, message: "A assinatura ainda não foi identificada. Solicite o cancelamento ao suporte da Nethanel." }, 409);

    try {
      if (d.provider_subscription_id) {
        const cancelSubscription = await fetch(
          `${base}/subscriptions/${encodeURIComponent(d.provider_subscription_id)}`,
          { method: "DELETE", headers: { "access_token": asaasKey, "User-Agent": "Nethanel-Elo/1.0" } },
        );
        if (!cancelSubscription.ok) throw new Error("A plataforma financeira não confirmou o cancelamento.");
      }
      if (d.payment_link_id) {
        const deactivate = await fetch(`${base}/paymentLinks/${encodeURIComponent(d.payment_link_id)}`, {
          method: "PUT", headers: {
            "accept": "application/json", "content-type": "application/json",
            "access_token": asaasKey, "User-Agent": "Nethanel-Elo/1.0",
          }, body: JSON.stringify({ active: false }),
        });
        if (!deactivate.ok) throw new Error("O link de pagamento não pôde ser desativado.");
      }
      const { error: updateError } = await admin.from("elo_developer_donations")
        .update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", d.id);
      if (updateError) throw updateError;
      return json({ ok: true, canceled: true });
    } catch (error) {
      return json({ ok: false, message: error instanceof Error ? error.message : "Falha ao cancelar." }, 502);
    }
  }

  if (body.action !== "create") return json({ ok: false, message: "Ação desconhecida." }, 400);
  const org = typeof body.organizationId === "string" ? body.organizationId : "";
  const cents = Number(body.amountCents);
  const method = String(body.method ?? "");
  const frequency = String(body.frequency ?? "");
  if (org !== DEMO_ORG_ID || !Number.isInteger(cents) ||
      cents < 500 || cents > 5000000 || !expectedMethods.has(method) || !expectedFrequency.has(frequency)) {
    return json({ ok: false,
      message: "Ofertas em teste estão disponíveis apenas na igreja Elo Church Demo. Confira valor e pagamento." }, 400);
  }

  const { data: intent, error: intentError } = await user.rpc("request_elo_developer_donation", {
    p_organization_id: org,
    p_amount_cents: cents,
    p_frequency: frequency,
    p_payment_method: method,
  });
  if (intentError || !intent?.id) return json({
    ok: false, message: intentError?.message ?? "Você não tem permissão para gerar a oferta."
  }, 403);

  const id = String(intent.id);
  if (intent.checkout_url && trustedAsaasLink(String(intent.checkout_url))) {
    if (method === "pix" && frequency === "once") {
      return json({ok:false,message:"Uma oferta anterior ainda está aberta no Asaas. Aguarde alguns minutos para gerar o Pix diretamente no Elo."},409);
    }
    return json({ ok: true, id, checkoutUrl: intent.checkout_url, reused: true, sandbox: true });
  }
  // Se uma tentativa anterior já gerou QR, reutilize-o sem nova cobrança.
  if (method === "pix" && frequency === "once" && intent.status === "pending") {
    const {data:d} = await admin.from("elo_developer_donations")
      .select("pix_payload,pix_expires_at,status")
      .eq("id",id).eq("organization_id",DEMO_ORG_ID)
      .eq("requested_by",userInfo.user.id).eq("environment","sandbox").maybeSingle();
    if (typeof d?.pix_payload === "string" && d.pix_payload.length > 30) {
      if (d.pix_expires_at && Date.parse(d.pix_expires_at) < Date.now())
        return json({ok:false,message:"O Pix anterior expirou. Tente gerar uma nova oferta após alguns minutos."},409);
      return json({ok:true,id,pixPayload:d.pix_payload,expiresAt:d.pix_expires_at,reused:true,sandbox:true});
    }
  }
  if (intent.status !== "draft") return json({
    ok: false, message: "Essa cobrança está sendo preparada. Aguarde um instante e tente novamente."
  }, 409);

  const { data: claimed, error: claimError } = await admin.from("elo_developer_donations")
    .update({ status: "processing", environment, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "draft").eq("requested_by", userInfo.user.id)
    .select("id").maybeSingle();
  if (claimError || !claimed) return json({ ok: false, message: "Cobrança já está em preparação." }, 409);

  if (method === "pix" && frequency === "once") {
    try {
      // QR estático de pagamento ÚNICO evita criar cadastro de pagador.
      // Consulta somente chaves ATIVAS na conta Asaas Sandbox (sem criar uma).
      const keysResult = await fetch(`${base}/pix/addressKeys?status=ACTIVE&limit=20`,{
        headers:{"access_token":asaasKey,"accept":"application/json",
          "User-Agent":"Nethanel-Elo-Sandbox-Pix/1.0"},
        signal:AbortSignal.timeout(18000),
      });
      const keysJson = await keysResult.json().catch(() => ({}));
      if(!keysResult.ok) throw new Error("Não foi possível consultar as chaves Pix do Sandbox.");
      const activeKey = Array.isArray(keysJson.data)
        ? keysJson.data.find((k: any) =>
          k?.status === "ACTIVE" && typeof k?.key === "string" && k.key.length >= 8)
        : null;
      if(!activeKey) throw new Error(
        "O Asaas Sandbox ainda não tem uma chave Pix ATIVA. Cadastre uma chave Pix na conta Sandbox para gerar o QR Code dentro do Elo."
      );
      const qrResp = await fetch(`${base}/pix/qrCodes/static`, {
        method:"POST",
        headers:{"access_token":asaasKey,"accept":"application/json",
          "content-type":"application/json","User-Agent":"Nethanel-Elo-Sandbox-Pix/1.0"},
        body:JSON.stringify({
          addressKey:activeKey.key,
          description:"Oferta única voluntária Nethanel Elo (simulação)",
          value:cents/100,
          format:"PAYLOAD",
          allowsMultiplePayments:false,
          expirationSeconds:86400,
          externalReference:`elo-donation:${id}`,
        }),
        signal:AbortSignal.timeout(22000),
      });
      const qr=await qrResp.json().catch(() => ({}));
      if(!qrResp.ok || typeof qr?.id!=="string" || typeof qr?.payload!=="string" ||
          qr.payload.length < 30 || qr.payload.length > 2000) {
        const providerMessage = qr?.errors?.[0]?.description;
        throw new Error(String(providerMessage ??
          "O Asaas Sandbox não retornou um QR Code Pix válido.").slice(0,260));
      }
      const expiresAt = new Date(Date.now()+86400000).toISOString();
      const {data:stored,error:storeError}=await admin.from("elo_developer_donations").update({
        status:"pending",provider_pix_qr_id:qr.id,
        pix_payload:qr.payload,pix_expires_at:expiresAt,
        updated_at:new Date().toISOString(),
      }).eq("id",id).eq("organization_id",DEMO_ORG_ID)
        .eq("requested_by",userInfo.user.id).eq("status","processing")
        .select("id").maybeSingle();
      if(storeError || !stored) {
        // QR remoto nunca pode permanecer ativo sem conciliação local.
        await fetch(`${base}/pix/qrCodes/static/${encodeURIComponent(qr.id)}`,{
          method:"DELETE",
          headers:{"access_token":asaasKey,"User-Agent":"Nethanel-Elo-Sandbox-Pix/1.0"},
        }).catch(()=>null);
        throw new Error("Não foi possível salvar o QR Code de teste.");
      }
      return json({ok:true,id,sandbox:true,pixPayload:qr.payload,expiresAt});
    }catch(error) {
      await admin.from("elo_developer_donations").update({
        status:"failed",updated_at:new Date().toISOString(),
      }).eq("id",id).eq("status","processing");
      return json({ok:false,message:error instanceof Error ? error.message :
        "Não foi possível gerar o QR Pix no Sandbox."},502);
    }
  }

  const types: Record<string, string> = { pix: "PIX", card: "CREDIT_CARD", boleto: "BOLETO" };
  const payload = {
    name: frequency === "once" ? "Oferta voluntária ao Nethanel Elo" : "Oferta mensal voluntária ao Nethanel Elo",
    description: "Apoio espontâneo aos custos de infraestrutura do Nethanel Elo. Não é pagamento por acesso.",
    value: cents / 100,
    // Para Pix mensal, o Asaas usa boleto com QR Pix em cada vencimento.
    billingType: frequency === "monthly" && method === "pix" ? "BOLETO" : types[method],
    chargeType: frequency === "once" ? "DETACHED" : "RECURRENT",
    ...(frequency === "monthly" ? { subscriptionCycle: "MONTHLY" } : {}),
    dueDateLimitDays: 3,
    externalReference: `elo-donation:${id}`,
    notificationEnabled: true,
  };

  try {
    const response = await fetch(`${base}/paymentLinks`, {
      method: "POST",
      headers: { "access_token": asaasKey, "accept": "application/json",
        "content-type": "application/json", "User-Agent": "Nethanel-Elo/1.0" },
      body: JSON.stringify(payload),
    });
    const payment = await response.json().catch(() => ({}));
    if (!response.ok || !payment?.id || !payment?.url || !trustedAsaasLink(String(payment.url))) {
      const description = payment?.errors?.[0]?.description ??
        "O Asaas não liberou um link de pagamento válido.";
      throw new Error(String(description));
    }

    const { error: savedError } = await admin.from("elo_developer_donations").update({
      status: "pending",
      payment_link_id: String(payment.id),
      checkout_url: String(payment.url),
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "processing");
    if (savedError) {
      // Não deixar um link cobrando sem registro local de rastreamento.
      await fetch(`${base}/paymentLinks/${encodeURIComponent(String(payment.id))}`, {
        method: "PUT", headers: {
          "access_token": asaasKey, "content-type": "application/json",
          "User-Agent": "Nethanel-Elo/1.0",
        }, body: JSON.stringify({ active: false }),
      }).catch(() => null);
      throw savedError;
    }

    return json({ ok: true, id, checkoutUrl: String(payment.url), sandbox: environment === "sandbox" });
  } catch (error) {
    await admin.from("elo_developer_donations")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", id).eq("status", "processing");
    return json({ ok: false,
      message: error instanceof Error ? error.message : "Não foi possível gerar a oferta."
    }, 502);
  }
});
