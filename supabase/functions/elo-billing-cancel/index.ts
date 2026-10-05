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

  let body: { organizationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Corpo inválido." }, 400);
  }

  if (!body.organizationId) {
    return json({ ok: false, message: "organizationId é obrigatório." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: context, error: contextError } = await userClient.rpc("billing_get_cancel_context", {
    p_organization_id: body.organizationId,
  });

  if (contextError) return json({ ok: false, message: contextError.message }, 403);

  const subscriptionId = String(context.provider_subscription_id);
  const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${mercadoPagoToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "cancelled" }),
  });

  const mpData = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json({
      ok: false,
      code: "mercado_pago_cancel_failed",
      message: mpData?.message ?? "Não foi possível cancelar a assinatura no Mercado Pago.",
    }, 502);
  }

  await adminClient
    .from("organization_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("organization_id", body.organizationId)
    .eq("provider", "mercado_pago")
    .eq("provider_subscription_id", subscriptionId);

  await adminClient
    .from("platform_checkout_sessions")
    .update({ status: "canceled", provider_payload: mpData, updated_at: new Date().toISOString() })
    .eq("organization_id", body.organizationId)
    .eq("provider", "mercado_pago")
    .eq("provider_subscription_id", subscriptionId);

  return json({
    ok: true,
    organizationId: body.organizationId,
    planCode: context.plan_code,
    status: "canceled",
  });
});
