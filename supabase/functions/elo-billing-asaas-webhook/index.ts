import { createClient } from "@supabase/supabase-js";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorMessage(error: any, fallback = "unknown_asaas_webhook_error") {
  return String(error?.message ?? error?.error_description ?? error?.details ?? fallback);
}

function paymentStatusFromEvent(event: string, payment: any) {
  switch (event) {
    case "PAYMENT_RECEIVED": return "received";
    case "PAYMENT_CONFIRMED": return "confirmed";
    case "PAYMENT_OVERDUE": return "overdue";
    case "PAYMENT_REFUNDED":
    case "PAYMENT_PARTIALLY_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED": return "refunded";
    case "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED":
    case "PAYMENT_REPROVED_BY_RISK_ANALYSIS": return "refused";
    case "PAYMENT_DELETED": return "canceled";
    case "PAYMENT_AUTHORIZED": return "pending";
    default: return String(payment?.status ?? "pending").toLowerCase();
  }
}

function authorizationStatusFromEvent(event: string, authorization: any) {
  if (authorization?.status) return String(authorization.status).toLowerCase();
  if (event.endsWith("_ACTIVATED")) return "active";
  if (event.endsWith("_CANCELLED")) return "cancelled";
  if (event.endsWith("_REFUSED")) return "refused";
  if (event.endsWith("_EXPIRED")) return "expired";
  return "created";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, ignored: true });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const webhookToken = (Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "").trim();

  if (!supabaseUrl || !serviceKey || !webhookToken) {
    return json({ ok: false, message: "Asaas billing webhook not configured" }, 503);
  }

  const receivedToken = (req.headers.get("asaas-access-token") ?? "").trim();
  if (!receivedToken || receivedToken !== webhookToken) {
    return json({ ok: false, message: "Unauthorized webhook" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const event = String(body?.event ?? "unknown");
  const payment = body?.payment ?? null;
  const authorization = body?.authorization ?? body?.paymentInstruction?.authorization ?? null;
  const resourceId = String(payment?.id ?? authorization?.id ?? body?.paymentInstruction?.id ?? "");
  const eventKey = String(body?.id ?? `${event}:${resourceId}:${body?.dateCreated ?? body?.date_created ?? ""}`);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: existingEvent } = await admin
    .from("platform_webhook_events")
    .select("status")
    .eq("provider", "asaas")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existingEvent?.status === "processed" || existingEvent?.status === "ignored") {
    return json({ ok: true, duplicate: true });
  }

  if (existingEvent) {
    const { error: resetError } = await admin
      .from("platform_webhook_events")
      .update({
        event_type: event,
        resource_id: resourceId || null,
        status: "received",
        payload: body,
        error_message: null,
        processed_at: null,
        received_at: new Date().toISOString(),
      })
      .eq("provider", "asaas")
      .eq("event_key", eventKey);
    if (resetError) return json({ ok: false, message: resetError.message }, 500);
  } else {
    const { error: insertError } = await admin
      .from("platform_webhook_events")
      .insert({
        provider: "asaas",
        event_key: eventKey,
        event_type: event,
        resource_id: resourceId || null,
        status: "received",
        payload: body,
      });
    if (insertError) return json({ ok: false, message: insertError.message }, 500);
  }

  async function finish(status: "processed" | "ignored" | "failed", message?: string) {
    await admin
      .from("platform_webhook_events")
      .update({
        status,
        error_message: message ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("provider", "asaas")
      .eq("event_key", eventKey);
  }

  try {
    if (event.startsWith("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_")) {
      const auth = body?.authorization;
      if (!auth?.id) {
        await finish("ignored", "missing_authorization_id");
        return json({ ok: true, ignored: true });
      }

      const status = authorizationStatusFromEvent(event, auth);
      const { data, error } = await admin.rpc("billing_apply_recurring_authorization", {
        p_provider: "asaas",
        p_provider_authorization_id: String(auth.id),
        p_status: status,
        p_next_due_date: auth?.nextDueDate ?? auth?.nextPaymentDate ?? null,
        p_provider_subscription_id: auth?.subscriptionId ?? auth?.subscription?.id ?? null,
        p_provider_payload: auth,
      });
      if (error) throw error;
      await finish(data?.ignored ? "ignored" : "processed");
      return json({ ok: true });
    }

    if (event.startsWith("PAYMENT_")) {
      if (!payment?.id) {
        await finish("ignored", "missing_payment_id");
        return json({ ok: true, ignored: true });
      }

      const status = paymentStatusFromEvent(event, payment);
      const amountCents = Math.round(Number(payment?.value ?? payment?.netValue ?? 0) * 100);
      const authorizationId = payment?.pixAutomaticAuthorizationId
        ?? payment?.pixAutomaticAuthorization?.id
        ?? payment?.automaticPixAuthorizationId
        ?? null;
      const subscriptionId = payment?.subscription ?? payment?.subscriptionId ?? null;
      const paidAt = payment?.confirmedDate
        ?? payment?.clientPaymentDate
        ?? payment?.paymentDate
        ?? payment?.creditDate
        ?? null;

      const { data, error } = await admin.rpc("billing_apply_provider_payment", {
        p_provider: "asaas",
        p_provider_payment_id: String(payment.id),
        p_external_reference: String(payment?.externalReference ?? ""),
        p_status: status,
        p_amount_cents: amountCents,
        p_currency: "BRL",
        p_paid_at: paidAt,
        p_provider_authorization_id: authorizationId ? String(authorizationId) : null,
        p_provider_subscription_id: subscriptionId ? String(subscriptionId) : null,
        p_provider_payload: payment,
      });
      if (error) throw error;
      await finish(data?.ignored ? "ignored" : "processed");
      return json({ ok: true });
    }

    if (event.startsWith("PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_")) {
      await finish("processed");
      return json({ ok: true });
    }

    await finish("ignored", `unsupported_event:${event}`);
    return json({ ok: true, ignored: true });
  } catch (error) {
    const message = errorMessage(error);
    await finish("failed", message);
    return json({ ok: false, message }, 500);
  }
});
