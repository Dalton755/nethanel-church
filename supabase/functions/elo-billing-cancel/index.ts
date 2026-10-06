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

function apiMessage(data: any, fallback: string) {
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.map((item: any) => item?.description ?? item?.code).filter(Boolean).join(" • ") || fallback;
  }
  return data?.message ?? fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, code: "supabase_not_configured", message: "Configuração interna indisponível." }, 503);
  }

  let body: { organizationId?: string };
  try { body = await req.json(); } catch { return json({ ok: false, message: "Corpo inválido." }, 400); }
  if (!body.organizationId) return json({ ok: false, message: "organizationId é obrigatório." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: context, error: contextError } = await userClient.rpc("billing_get_cancel_context_v2", {
    p_organization_id: body.organizationId,
  });
  if (contextError) return json({ ok: false, message: contextError.message }, 403);

  const provider = String(context?.provider ?? "");

  if (provider === "mercado_pago") {
    const token = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? "";
    if (!token) return json({ ok: false, code: "mercado_pago_not_configured", message: "Mercado Pago ainda não foi configurado." }, 503);

    const subscriptionId = String(context.provider_subscription_id ?? "");
    const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscriptionId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json({ ok: false, message: data?.message ?? "Não foi possível cancelar a assinatura no Mercado Pago." }, 502);

    await admin
      .from("organization_subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("organization_id", body.organizationId)
      .eq("provider", "mercado_pago")
      .eq("provider_subscription_id", subscriptionId);

    await admin
      .from("platform_checkout_sessions")
      .update({ status: "canceled", provider_payload: data, updated_at: new Date().toISOString() })
      .eq("organization_id", body.organizationId)
      .eq("provider", "mercado_pago")
      .eq("provider_subscription_id", subscriptionId);

    return json({ ok: true, provider, status: "canceled", planCode: context.plan_code });
  }

  if (provider === "asaas") {
    const token = Deno.env.get("ASAAS_API_KEY") ?? "";
    const base = (Deno.env.get("ASAAS_API_URL") ?? "https://api.asaas.com/v3").replace(/\/$/, "");
    if (!token) return json({ ok: false, code: "asaas_not_configured", message: "Asaas ainda não foi configurado." }, 503);

    const authorizationId = String(context.provider_authorization_id ?? "");
    if (!authorizationId) return json({ ok: false, message: "Autorização recorrente não encontrada." }, 400);

    const response = await fetch(`${base}/pix/automatic/authorizations/${encodeURIComponent(authorizationId)}`, {
      method: "DELETE",
      headers: {
        accept: "application/json",
        access_token: token,
        "User-Agent": "Nethanel-Elo/1.0",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json({ ok: false, message: apiMessage(data, "Não foi possível cancelar o Pix Automático.") }, 502);

    await admin
      .from("billing_recurring_authorizations")
      .update({ status: "cancelled", provider_payload: data, updated_at: new Date().toISOString() })
      .eq("organization_id", body.organizationId)
      .eq("provider", "asaas")
      .eq("provider_authorization_id", authorizationId);

    await admin
      .from("organization_subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("organization_id", body.organizationId);

    return json({ ok: true, provider, status: "canceled", planCode: context.plan_code });
  }

  return json({ ok: false, message: "Não existe cobrança recorrente compatível para cancelar." }, 400);
});
