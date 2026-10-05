import { createClient } from "@supabase/supabase-js";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function mpGet(path: string, token: string) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? `Mercado Pago ${response.status}`);
  return data;
}

function pickSubscriptionId(payment: any) {
  return payment?.subscription_id ??
    payment?.preapproval_id ??
    payment?.metadata?.preapproval_id ??
    payment?.metadata?.subscription_id ??
    payment?.point_of_interaction?.transaction_data?.subscription_id ??
    null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, ignored: true });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const mercadoPagoToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") ?? "";

  if (!supabaseUrl || !serviceKey || !mercadoPagoToken) {
    return json({ ok: false, message: "Billing webhook not configured" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const url = new URL(req.url);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const eventType = String(body?.type ?? url.searchParams.get("topic") ?? "unknown");
  const resourceId = String(body?.data?.id ?? url.searchParams.get("id") ?? "");
  const eventKey = String(body?.id ?? `${eventType}:${resourceId}:${body?.action ?? "event"}:${body?.date_created ?? ""}`);

  const { error: insertEventError } = await admin
    .from("platform_webhook_events")
    .insert({
      provider: "mercado_pago",
      event_key: eventKey,
      event_type: eventType,
      resource_id: resourceId || null,
      status: "received",
      payload: body,
    });

  if (insertEventError?.code === "23505") {
    return json({ ok: true, duplicate: true });
  }
  if (insertEventError) {
    return json({ ok: false, message: insertEventError.message }, 500);
  }

  async function finish(status: "processed" | "ignored" | "failed", errorMessage?: string) {
    await admin
      .from("platform_webhook_events")
      .update({
        status,
        error_message: errorMessage ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("provider", "mercado_pago")
      .eq("event_key", eventKey);
  }

  try {
    if (eventType === "subscription_preapproval") {
      if (!resourceId) {
        await finish("ignored", "missing_resource_id");
        return json({ ok: true, ignored: true });
      }

      const subscription = await mpGet(`/preapproval/${encodeURIComponent(resourceId)}`, mercadoPagoToken);
      const externalReference = String(subscription?.external_reference ?? "");
      const nextPaymentDate = subscription?.next_payment_date ?? null;

      const { data, error } = await admin.rpc("platform_apply_mercado_pago_subscription", {
        p_provider_subscription_id: String(subscription.id),
        p_external_reference: externalReference,
        p_provider_status: String(subscription.status ?? "pending"),
        p_next_payment_date: nextPaymentDate,
        p_provider_payload: subscription,
      });

      if (error) throw error;
      await finish(data?.ignored ? "ignored" : "processed");
      return json({ ok: true });
    }

    if (eventType === "payment") {
      if (!resourceId) {
        await finish("ignored", "missing_resource_id");
        return json({ ok: true, ignored: true });
      }

      const payment = await mpGet(`/v1/payments/${encodeURIComponent(resourceId)}`, mercadoPagoToken);
      const externalReference = String(payment?.external_reference ?? "");
      const subscriptionId = pickSubscriptionId(payment);
      const amountCents = Math.round(Number(payment?.transaction_amount ?? 0) * 100);
      const currency = String(payment?.currency_id ?? "BRL");
      const paidAt = payment?.date_approved ?? payment?.date_last_updated ?? null;

      const { data, error } = await admin.rpc("platform_record_mercado_pago_payment", {
        p_provider_payment_id: String(payment.id),
        p_external_reference: externalReference,
        p_status: String(payment.status ?? "unknown"),
        p_amount_cents: amountCents,
        p_currency: currency,
        p_paid_at: paidAt,
        p_provider_subscription_id: subscriptionId ? String(subscriptionId) : null,
        p_provider_payload: payment,
      });

      if (error) throw error;
      await finish(data?.ignored ? "ignored" : "processed");
      return json({ ok: true });
    }

    if (eventType === "subscription_authorized_payment") {
      if (!resourceId) {
        await finish("ignored", "missing_resource_id");
        return json({ ok: true, ignored: true });
      }

      const authorized = await mpGet(`/authorized_payments/${encodeURIComponent(resourceId)}`, mercadoPagoToken);
      const preapprovalId = authorized?.preapproval_id ?? authorized?.subscription_id ?? null;

      if (preapprovalId) {
        const subscription = await mpGet(`/preapproval/${encodeURIComponent(String(preapprovalId))}`, mercadoPagoToken);
        const { error } = await admin.rpc("platform_apply_mercado_pago_subscription", {
          p_provider_subscription_id: String(subscription.id),
          p_external_reference: String(subscription?.external_reference ?? ""),
          p_provider_status: String(subscription.status ?? "pending"),
          p_next_payment_date: subscription?.next_payment_date ?? null,
          p_provider_payload: subscription,
        });
        if (error) throw error;
      }

      await finish("processed");
      return json({ ok: true });
    }

    await finish("ignored", `unsupported_event_type:${eventType}`);
    return json({ ok: true, ignored: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_webhook_error";
    await finish("failed", message);
    return json({ ok: false, message }, 500);
  }
});
