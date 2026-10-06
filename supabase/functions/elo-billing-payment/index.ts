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

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function asaasError(data: any, fallback: string) {
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
  const asaasKey = (Deno.env.get("ASAAS_API_KEY") ?? "").trim();
  const asaasBase = (Deno.env.get("ASAAS_API_URL") ?? "https://api.asaas.com/v3").replace(/\/$/, "");
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, code: "supabase_not_configured", message: "Configuração interna indisponível." }, 503);
  }

  let body: {
    action?: string;
    organizationId?: string;
    planCode?: string;
    paymentMethod?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Corpo inválido." }, 400);
  }

  if (body.action === "capabilities") {
    console.log(JSON.stringify({
      billingCapabilities: true,
      asaasConfigured: Boolean(asaasKey),
      asaasEnvironment: asaasBase.includes("sandbox") ? "sandbox" : "production",
      mercadoPagoAvailable: Boolean(Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")),
    }));
    return json({
      ok: true,
      asaasConfigured: Boolean(asaasKey),
      methods: ["pix", "pix_automatic", "boleto", "card"],
      mercadoPagoAvailable: Boolean(Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")),
    });
  }

  if (!asaasKey) {
    return json({
      ok: false,
      code: "asaas_not_configured",
      message: "As novas formas de pagamento ainda estão sendo ativadas. O Mercado Pago continua disponível enquanto isso.",
    }, 503);
  }

  if (!body.organizationId || !body.planCode || !body.paymentMethod) {
    return json({ ok: false, message: "organizationId, planCode e paymentMethod são obrigatórios." }, 400);
  }

  const method = String(body.paymentMethod).toLowerCase();
  if (!["pix", "pix_automatic", "boleto", "card"].includes(method)) {
    return json({ ok: false, message: "Forma de pagamento inválida." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: context, error: contextError } = await userClient.rpc("billing_prepare_invoice", {
    p_organization_id: body.organizationId,
    p_plan_code: body.planCode,
    p_payment_method: method,
    p_provider: "asaas",
  });

  if (contextError) return json({ ok: false, message: contextError.message }, 403);

  const invoiceId = String(context.invoice_id);
  const attemptId = String(context.attempt_id);
  const payer = context.payer ?? {};
  const amount = Number(context.amount_cents) / 100;
  const dueDate = String(context.due_date);
  const planName = String(context.plan_name ?? "Plano Elo");

  async function asaas(path: string, init: RequestInit = {}) {
    const response = await fetch(`${asaasBase}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        access_token: asaasKey,
        "User-Agent": "Nethanel-Elo/1.0",
        ...(init.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(asaasError(data, `Asaas ${response.status}`));
    }
    return data;
  }

  async function rememberCustomer(customerId: string) {
    await admin
      .from("billing_payers")
      .update({
        provider_customer_ids: { ...(payer.provider_customer_ids ?? {}), asaas: customerId },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", body.organizationId!);
  }

  async function ensureCustomer() {
    const saved = payer?.provider_customer_ids?.asaas;
    if (saved) return String(saved);

    const found = await asaas(`/customers?externalReference=${encodeURIComponent(body.organizationId!)}&limit=1`, {
      method: "GET",
      headers: { "content-type": "application/json" },
    });

    const existing = Array.isArray(found?.data) ? found.data[0] : null;
    if (existing?.id) {
      await rememberCustomer(String(existing.id));
      return String(existing.id);
    }

    const customerPayload: Record<string, unknown> = {
      name: payer.name,
      cpfCnpj: digits(payer.cpf_cnpj),
      externalReference: body.organizationId,
      notificationDisabled: false,
    };
    if (payer.email) customerPayload.email = payer.email;
    if (payer.phone) customerPayload.mobilePhone = digits(payer.phone);

    const created = await asaas("/customers", {
      method: "POST",
      body: JSON.stringify(customerPayload),
    });

    if (!created?.id) throw new Error("O Asaas não retornou o identificador do pagador.");
    await rememberCustomer(String(created.id));
    return String(created.id);
  }

  async function registerAttempt(input: {
    customerId: string;
    paymentId?: string | null;
    authorizationId?: string | null;
    subscriptionId?: string | null;
    status?: string | null;
    checkoutUrl?: string | null;
    pixPayload?: string | null;
    pixExpiration?: string | null;
    boletoUrl?: string | null;
    providerPayload?: unknown;
  }) {
    const { error } = await admin.rpc("billing_register_provider_attempt", {
      p_attempt_id: attemptId,
      p_provider_customer_id: input.customerId,
      p_provider_payment_id: input.paymentId ?? null,
      p_provider_authorization_id: input.authorizationId ?? null,
      p_provider_subscription_id: input.subscriptionId ?? null,
      p_status: input.status ?? "pending",
      p_checkout_url: input.checkoutUrl ?? null,
      p_pix_payload: input.pixPayload ?? null,
      p_pix_expiration: input.pixExpiration ?? null,
      p_boleto_url: input.boletoUrl ?? null,
      p_provider_payload: input.providerPayload ?? {},
    });
    if (error) throw error;
  }

  try {
    const customerId = await ensureCustomer();
    const description = `Nethanel Elo - ${planName}`.slice(0, 100);

    if (method === "pix_automatic") {
      const contractId = `ELO-${invoiceId.replace(/-/g, "").slice(0, 31)}`.slice(0, 35);
      const authorization = await asaas("/pix/automatic/authorizations", {
        method: "POST",
        body: JSON.stringify({
          frequency: "MONTHLY",
          contractId,
          startDate: dueDate,
          value: amount,
          description: `Elo ${planName}`.slice(0, 35),
          customerId,
          immediateQrCode: {},
          paymentCreationMode: "SUBSCRIPTION",
          retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
        }),
      });

      const authorizationId = String(authorization?.id ?? "");
      if (!authorizationId) throw new Error("O Asaas não retornou a autorização do Pix Automático.");

      const qr = authorization?.immediateQrCode ?? authorization?.qrCode ?? {};
      const pixPayload = qr?.payload ?? qr?.copyPaste ?? qr?.brCode ?? null;
      const pixExpiration = qr?.expirationDate ?? qr?.expiration ?? null;
      const subscriptionId = authorization?.subscriptionId ?? authorization?.subscription?.id ?? null;

      await registerAttempt({
        customerId,
        authorizationId,
        subscriptionId: subscriptionId ? String(subscriptionId) : null,
        status: String(authorization?.status ?? "created").toLowerCase(),
        pixPayload: pixPayload ? String(pixPayload) : null,
        pixExpiration: pixExpiration ? String(pixExpiration) : null,
        providerPayload: authorization,
      });

      const { error: recurringError } = await admin.rpc("billing_register_recurring_authorization", {
        p_attempt_id: attemptId,
        p_provider_authorization_id: authorizationId,
        p_provider_customer_id: customerId,
        p_provider_subscription_id: subscriptionId ? String(subscriptionId) : null,
        p_status: String(authorization?.status ?? "created").toLowerCase(),
        p_provider_payload: authorization,
      });
      if (recurringError) throw recurringError;

      return json({
        ok: true,
        provider: "asaas",
        paymentMethod: method,
        invoiceId,
        attemptId,
        authorizationId,
        pixPayload,
        pixExpiration,
        qrCodeBase64: qr?.encodedImage ?? null,
        message: "Pague o primeiro Pix e autorize a recorrência no aplicativo do seu banco.",
      });
    }

    const billingType = method === "pix" ? "PIX" : method === "boleto" ? "BOLETO" : "CREDIT_CARD";
    const payment = await asaas("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType,
        value: amount,
        dueDate,
        description,
        externalReference: invoiceId,
      }),
    });

    const paymentId = String(payment?.id ?? "");
    if (!paymentId) throw new Error("O Asaas não retornou o identificador da cobrança.");

    let pixPayload: string | null = null;
    let pixExpiration: string | null = null;
    let qrCodeBase64: string | null = null;

    if (method === "pix") {
      const qr = await asaas(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`, {
        method: "GET",
        headers: { "content-type": "application/json" },
      });
      pixPayload = qr?.payload ? String(qr.payload) : null;
      pixExpiration = qr?.expirationDate ? String(qr.expirationDate) : null;
      qrCodeBase64 = qr?.encodedImage ? String(qr.encodedImage) : null;
    }

    const checkoutUrl = payment?.invoiceUrl ? String(payment.invoiceUrl) : null;
    const boletoUrl = payment?.bankSlipUrl ? String(payment.bankSlipUrl) : null;

    await registerAttempt({
      customerId,
      paymentId,
      status: String(payment?.status ?? "pending").toLowerCase(),
      checkoutUrl,
      pixPayload,
      pixExpiration,
      boletoUrl,
      providerPayload: payment,
    });

    return json({
      ok: true,
      provider: "asaas",
      paymentMethod: method,
      invoiceId,
      attemptId,
      providerPaymentId: paymentId,
      checkoutUrl,
      boletoUrl,
      pixPayload,
      pixExpiration,
      qrCodeBase64,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível gerar a cobrança.";
    await admin
      .from("billing_payment_attempts")
      .update({ status: "failed", provider_payload: { error: message }, updated_at: new Date().toISOString() })
      .eq("id", attemptId);
    return json({ ok: false, code: "asaas_payment_failed", message }, 502);
  }
});
