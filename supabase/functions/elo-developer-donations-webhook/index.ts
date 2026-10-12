import { createClient } from "@supabase/supabase-js";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const token = (Deno.env.get("ASAAS_DONATIONS_WEBHOOK_TOKEN") ?? "").trim();
  const incoming = (req.headers.get("asaas-access-token") ?? "").trim();
  if (!token || token.length < 32 || incoming !== token)
    return json({ ok: false, message: "Webhook não autorizado." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ ok: false }, 503);

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return json({ ok: false, message: "Payload inválido." }, 400); }

  const eventName = String(body.event ?? "");
  // Este endpoint é exclusivo de ofertas; outros eventos não alteram mensalidades ou planos.
  if (!eventName.startsWith("PAYMENT_")) return json({ ok: true, ignored: true });
  const payment = body.payment;
  if (!payment?.id) return json({ ok: true, ignored: true });

  const linkId = typeof payment.paymentLink === "string" ? payment.paymentLink : null;
  const subscriptionId = typeof payment.subscription === "string"
    ? payment.subscription : null;
  if (!linkId && !subscriptionId) return json({ ok: true, ignored: true });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let donation: Record<string, any> | null = null;

  if (linkId) {
    const { data } = await admin.from("elo_developer_donations").select("*")
      .eq("payment_link_id", linkId).maybeSingle();
    donation = data;
  }
  if (!donation && subscriptionId) {
    const { data } = await admin.from("elo_developer_donations").select("*")
      .eq("provider_subscription_id", subscriptionId).maybeSingle();
    donation = data;
  }
  if (!donation) return json({ ok: true, ignored: true });

  const status = (() => {
    if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(eventName)) return "paid";
    if (eventName === "PAYMENT_REFUNDED") return "refunded";
    if (eventName === "PAYMENT_OVERDUE") return "overdue";
    if (eventName === "PAYMENT_DELETED") return "canceled";
    return "pending";
  })();

  const amountCents = Math.round(Number(payment.value) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents !== donation.amount_cents) {
    // Recusar discrepância de valor: cobrança nunca é conciliada apenas por link.
    return json({ ok: false, message: "Valor divergente." }, 422);
  }

  const env = (Deno.env.get("ASAAS_API_URL") ?? "https://api-sandbox.asaas.com/v3").includes("sandbox")
    ? "sandbox" : "production";
  if (donation.environment !== env) {
    return json({ ok: false, message: "Ambiente divergente." }, 422);
  }

  const eventId = String(body.id ?? "");
  if (!eventId || eventId.length > 150) return json({ ok: false, message: "Evento sem identificador." }, 422);

  const { error } = await admin.rpc("elo_apply_developer_donation_event", {
    p_donation_id: donation.id,
    p_event_key: `${env}:${eventId}`,
    p_provider_payment_id: String(payment.id),
    p_status: status,
    p_amount_cents: amountCents,
    p_provider_subscription_id: subscriptionId,
  });
  if (error) {
    console.error("Falha conciliação de oferta", { code: error.code, event: eventName });
    return json({ ok: false, message: "Falha ao registrar pagamento." }, 500);
  }

  // Um link de doação não deve gerar múltiplas assinaturas por engano.
  // Após o primeiro pagamento recebido, desative apenas o link.
  // Cancelar o link NAO cancela a assinatura mensal já criada no Asaas.
  if (status === "paid" && donation.payment_link_id) {
    const apiKey = (Deno.env.get("ASAAS_API_KEY") ?? "").trim();
    const base = (Deno.env.get("ASAAS_API_URL") ?? "https://api-sandbox.asaas.com/v3").replace(/\\/$/, "");
    const liveAllowed = Deno.env.get("ELO_DONATIONS_LIVE_ENABLED") === "true";
    if (apiKey && (env === "sandbox" || liveAllowed)) {
      const disabled = await fetch(`${base}/paymentLinks/${encodeURIComponent(donation.payment_link_id)}`, {
        method: "PUT",
        headers: { "access_token": apiKey, "content-type": "application/json", "User-Agent": "Nethanel-Elo/1.0" },
        body: JSON.stringify({ active: false }),
      }).catch(() => null);
      if (!disabled?.ok) console.warn("Não foi possível desativar link de oferta após pagamento.");
    }
  }

  return json({ ok: true });
});
