import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const mercadoPagoToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, code: "supabase_not_configured", message: "Configuração interna indisponível." }, 503);
  }

  if (!mercadoPagoToken) {
    return json({ ok: false, code: "mercado_pago_not_configured", message: "Mercado Pago ainda não foi configurado para o Elo." }, 503);
  }

  let body: { organizationId?: string; planCode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Corpo inválido." }, 400);
  }

  if (!body.organizationId || !body.planCode) {
    return json({ ok: false, message: "organizationId e planCode são obrigatórios." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: checkoutContext, error: contextError } = await userClient.rpc("billing_prepare_checkout", {
    p_organization_id: body.organizationId,
    p_plan_code: body.planCode,
  });

  if (contextError) return json({ ok: false, message: contextError.message }, 403);
  if (checkoutContext?.already_active) {
    return json({ ok: true, alreadyActive: true, planCode: checkoutContext.plan_code });
  }

  const sessionId = checkoutContext.checkout_session_id as string;
  const amount = Number(checkoutContext.amount_cents) / 100;
  const backUrl = Deno.env.get("ELO_BILLING_RETURN_URL") ?? "https://nethanel-church.vercel.app/assinatura/retorno";
  const notificationUrl = `${supabaseUrl}/functions/v1/elo-billing-webhook`;

  const mpPayload = {
    reason: `Nethanel Elo — ${checkoutContext.plan_name}`,
    external_reference: sessionId,
    payer_email: checkoutContext.payer_email,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: amount,
      currency_id: checkoutContext.currency ?? "BRL",
    },
    back_url: backUrl,
    notification_url: notificationUrl,
    status: "pending",
  };

  const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mercadoPagoToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": sessionId,
    },
    body: JSON.stringify(mpPayload),
  });

  const mpData = await mpResponse.json().catch(() => ({}));

  if (!mpResponse.ok || !mpData?.id || !mpData?.init_point) {
    await adminClient
      .from("platform_checkout_sessions")
      .update({ status: "failed", provider_payload: mpData, updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    return json({
      ok: false,
      code: "mercado_pago_checkout_failed",
      message: mpData?.message ?? "Não foi possível abrir a assinatura no Mercado Pago.",
    }, 502);
  }

  const { error: attachError } = await userClient.rpc("billing_attach_provider_subscription", {
    p_checkout_session_id: sessionId,
    p_provider_subscription_id: String(mpData.id),
    p_checkout_url: String(mpData.init_point),
    p_provider_payload: mpData,
  });

  if (attachError) {
    return json({ ok: false, message: attachError.message }, 500);
  }

  return json({
    ok: true,
    alreadyActive: false,
    checkoutSessionId: sessionId,
    subscriptionId: String(mpData.id),
    checkoutUrl: String(mpData.init_point),
    planCode: checkoutContext.plan_code,
    planName: checkoutContext.plan_name,
    amountCents: checkoutContext.amount_cents,
  });
});
