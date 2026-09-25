
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type ClaimedItem = {
  id: number;
  organization_id: string;
  auth_user_id: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
  tokens: Array<{ token: string; platform: "android" | "ios" }>;
};

type ClaimResponse = {
  lease_token: string;
  items: ClaimedItem[];
};

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function getAdminKey() {
  const secretJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretJson) {
    try {
      const parsed = JSON.parse(secretJson);
      if (parsed?.default) return { key: String(parsed.default), legacy: false };
    } catch {
      // Fall back to the legacy service role only when needed.
    }
  }

  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return legacy ? { key: legacy, legacy: true } : null;
}

function adminHeaders(key: string, legacy: boolean) {
  const headers: Record<string, string> = {
    apikey: key,
    "content-type": "application/json",
  };
  if (legacy) headers.authorization = `Bearer ${key}`;
  return headers;
}

async function rpc<T>(
  url: string,
  key: string,
  legacy: boolean,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: adminHeaders(key, legacy),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${name} failed: ${response.status} ${(await response.text()).slice(0, 500)}`);
  }

  return await response.json() as T;
}

async function disableExpoToken(
  url: string,
  key: string,
  legacy: boolean,
  token: string,
) {
  const now = new Date().toISOString();
  const query = new URLSearchParams({
    provider: "eq.expo",
    push_token: `eq.${token}`,
  });

  const response = await fetch(`${url}/rest/v1/push_devices?${query.toString()}`, {
    method: "PATCH",
    headers: {
      ...adminHeaders(key, legacy),
      prefer: "return=minimal",
    },
    body: JSON.stringify({ disabled_at: now, updated_at: now }),
  });

  if (!response.ok) {
    console.error("Failed to disable invalid Expo token", response.status, await response.text());
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const admin = getAdminKey();
  if (!url || !admin) return json({ error: "Server configuration missing" }, 500);

  const dispatchKey = req.headers.get("x-dispatch-key")?.trim();
  if (!dispatchKey) return json({ error: "Unauthorized" }, 401);

  try {
    const authorized = await rpc<boolean>(
      url,
      admin.key,
      admin.legacy,
      "verify_notification_dispatch_key",
      { p_key: dispatchKey },
    );

    if (!authorized) return json({ error: "Unauthorized" }, 401);
  } catch (error) {
    console.error("Dispatcher authorization failed", error);
    return json({ error: "Unauthorized" }, 401);
  }

  let limit = 100;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.limit === "number") {
      limit = Math.max(1, Math.min(100, Math.trunc(body.limit)));
    }
  } catch {
    // Default batch size is fine.
  }

  let claim: ClaimResponse;
  try {
    claim = await rpc<ClaimResponse>(
      url,
      admin.key,
      admin.legacy,
      "claim_push_notifications",
      { p_limit: limit },
    );
  } catch (error) {
    console.error("claim_push_notifications failed", error);
    return json({ error: "Unable to claim notifications" }, 500);
  }

  const items = Array.isArray(claim?.items) ? claim.items : [];
  const leaseToken = claim?.lease_token;

  if (!leaseToken || items.length === 0) {
    return json({ ok: true, claimed: 0, sent: 0, retried: 0 });
  }

  const itemState = new Map<number, { success: number; errors: string[] }>();
  const tokenToItem = new Map<string, number>();
  const messages: Array<Record<string, unknown>> = [];

  for (const item of items) {
    itemState.set(item.id, { success: 0, errors: [] });

    if (!Array.isArray(item.tokens) || item.tokens.length === 0) {
      itemState.get(item.id)!.success = 1;
      continue;
    }

    for (const target of item.tokens) {
      if (!target?.token) continue;
      tokenToItem.set(target.token, item.id);
      messages.push({
        to: target.token,
        sound: "default",
        title: item.title,
        body: item.body,
        data: {
          category: item.category,
          ...item.data,
        },
        priority: "high",
      });
    }
  }

  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  let sent = 0;

  for (const batch of chunks(messages, 100)) {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;

    let response: Response;
    try {
      response = await fetch(EXPO_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      for (const msg of batch) {
        const id = tokenToItem.get(String(msg.to));
        if (id) itemState.get(id)?.errors.push(message);
      }
      continue;
    }

    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = `Expo HTTP ${response.status}: ${JSON.stringify(raw).slice(0, 300)}`;
      for (const msg of batch) {
        const id = tokenToItem.get(String(msg.to));
        if (id) itemState.get(id)?.errors.push(message);
      }
      continue;
    }

    const tickets = Array.isArray(raw?.data) ? raw.data : [raw?.data];

    for (let i = 0; i < batch.length; i++) {
      const token = String(batch[i].to);
      const id = tokenToItem.get(token);
      if (!id) continue;

      const state = itemState.get(id)!;
      const ticket = tickets[i];

      if (ticket?.status === "ok") {
        state.success += 1;
        sent += 1;
        continue;
      }

      const errorCode = ticket?.details?.error;
      const errorMessage = ticket?.message || errorCode || "Expo rejected notification";
      state.errors.push(String(errorMessage));

      if (errorCode === "DeviceNotRegistered") {
        await disableExpoToken(url, admin.key, admin.legacy, token);
      }
    }
  }

  const results = items.map((item) => {
    const state = itemState.get(item.id) ?? { success: 0, errors: ["Unknown delivery state"] };
    return {
      id: item.id,
      ok: state.success > 0,
      error: state.success > 0 ? null : state.errors.join(" | ").slice(0, 500),
    };
  });

  try {
    const acknowledged = await rpc<number>(
      url,
      admin.key,
      admin.legacy,
      "complete_push_notifications",
      {
        p_lease_token: leaseToken,
        p_results: results,
      },
    );

    return json({
      ok: true,
      claimed: items.length,
      acknowledged,
      sent,
      retried: results.filter((r) => !r.ok).length,
    });
  } catch (error) {
    console.error("complete_push_notifications failed", error);
    return json({ error: "Push sent but queue acknowledgement failed" }, 500);
  }
});
