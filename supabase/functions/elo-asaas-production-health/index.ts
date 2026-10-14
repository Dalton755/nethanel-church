import { createClient } from "@supabase/supabase-js";

// Diagnóstico SOMENTE LEITURA da conexão Asaas de produção.
// Não cria cobranças, QRs, cadastros, webhooks ou transferências.
// A chave de produção é lida APENAS no servidor; jamais retorna ao app.
const API_URL = "https://api.asaas.com/v3/pix/addressKeys?status=ACTIVE&limit=20";
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({
    environment: "production", paymentsEnabled: false, ...body,
  }), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
  } });

const checked = new Map<string, number>();
const MIN_INTERVAL_MS = 30_000;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return json(405, { ok: false, code: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = request.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey)
    return json(503, { ok: false, code: "supabase_not_configured" });
  if (!bearer.startsWith("Bearer "))
    return json(401, { ok: false, code: "authentication_required" });

  const auth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: authError } = await auth.auth.getUser();
  if (authError || !verified.user)
    return json(401, { ok: false, code: "invalid_session" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Somente administrador global da plataforma, NUNCA administrador de igreja.
  const { data: platformAdmin, error: roleError } = await admin
    .from("platform_admins").select("user_id")
    .eq("user_id", verified.user.id).eq("active", true).maybeSingle();
  if (roleError || !platformAdmin)
    return json(403, { ok: false, code: "platform_admin_required" });

  // Body mínimo e pré-determinado; não permite selecionar endpoint / headers.
  const { action } = await request.json().catch(() => ({ action: "" }));
  if (action !== "check")
    return json(400, { ok: false, code: "invalid_action" });

  const last = checked.get(verified.user.id) ?? 0;
  if (Date.now() - last < MIN_INTERVAL_MS)
    return json(429, { ok: false, code: "wait_before_retry" });
  checked.set(verified.user.id, Date.now());

  const key = (Deno.env.get("ELO_ASAAS_PRODUCTION_API_KEY") ?? "").trim();
  if (!key)
    return json(200, { ok: true, connected: false, activePixKey: false, code: "key_missing" });
  if (!key.startsWith("$aact_prod_"))
    return json(200, { ok: true, connected: false, activePixKey: false, code: "invalid_environment" });

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        "access_token": key,
        "accept": "application/json",
        "User-Agent": "Nethanel-Elo-Production-ReadOnly-Check/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    });
    // Nunca registrar corpo da resposta, chaves Pix, token ou dados da conta.
    if (response.status === 401)
      return json(200, { ok: true, connected: false, activePixKey: false, code: "not_authorized" });
    if (response.status === 403)
      return json(200, { ok: true, connected: false, activePixKey: false, code: "api_access_restricted" });
    if (response.status === 429)
      return json(200, { ok: true, connected: false, activePixKey: false, code: "provider_rate_limited" });
    if (!response.ok)
      return json(200, { ok: true, connected: false, activePixKey: false, code: "provider_unavailable" });

    const result = await response.json().catch(() => ({}));
    if (!Array.isArray(result?.data))
      return json(200, { ok: true, connected: false, activePixKey: false, code: "unexpected_response" });
    const hasActivePix = result.data.some((entry: unknown) =>
      entry !== null && typeof entry === "object" &&
      (entry as Record<string, unknown>).status === "ACTIVE");
    return json(200, {
      ok: true, connected: true, activePixKey: hasActivePix,
      code: hasActivePix ? "connected" : "no_active_pix",
    });
  } catch {
    return json(200, { ok: true, connected: false, activePixKey: false, code: "network_error" });
  }
});
