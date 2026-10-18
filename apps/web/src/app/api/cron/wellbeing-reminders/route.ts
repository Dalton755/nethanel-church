import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brasiliaDate } from "@/features/wellbeing/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Preference = { person_id: string; organization_id: string; daily_reminder_enabled: boolean };
type Person = { id: string; auth_user_id: string | null };
type Device = { user_id: string; organization_id: string; push_token: string; provider: string; disabled_at: string | null };

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !serviceKey || !url) return NextResponse.json({ error: "Worker não configurado" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23"
  }).format(new Date()));
  if (hour !== 10) return NextResponse.json({ skipped: "outside_brasilia_10am" });
  const date = brasiliaDate(new Date());
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: preferences, error: preferenceError } = await admin.from("member_wellbeing_preferences")
    .select("person_id,organization_id,daily_reminder_enabled").eq("daily_reminder_enabled", true).limit(1000);
  if (preferenceError) return NextResponse.json({ error: "Falha ao consultar preferências" }, { status: 500 });
  const opted = (preferences ?? []) as Preference[];
  if (!opted.length) return NextResponse.json({ checked: 0, sent: 0 });
  const personIds = opted.map((entry) => entry.person_id);
  const { data: people, error: peopleError } = await admin.from("people")
    .select("id,auth_user_id").in("id", personIds);
  const { data: checkins, error: checkinError } = await admin.from("member_wellbeing_checkins")
    .select("person_id").eq("checkin_date", date).in("person_id", personIds);
  if (peopleError || checkinError) return NextResponse.json({ error: "Falha ao consultar membros" }, { status: 500 });
  const users = new Map(((people ?? []) as Person[]).map((person) => [person.id, person.auth_user_id]));
  const checked = new Set((checkins ?? []).map((entry) => entry.person_id));
  const targets = opted.filter((entry) => !checked.has(entry.person_id) && users.get(entry.person_id));
  if (!targets.length) return NextResponse.json({ checked: opted.length, sent: 0 });
  const userIds = [...new Set(targets.map((entry) => users.get(entry.person_id)!).filter(Boolean))];
  const { data: devices, error: deviceError } = await admin.from("push_devices")
    .select("user_id,organization_id,push_token,provider,disabled_at").in("user_id", userIds).is("disabled_at", null);
  if (deviceError) return NextResponse.json({ error: "Falha ao consultar dispositivos" }, { status: 500 });
  const validDevices = (devices ?? []) as Device[];
  let sent = 0, failed = 0;
  for (const target of targets) {
    const tokens = [...new Set(validDevices.filter((device) =>
      device.user_id === users.get(target.person_id) &&
      device.organization_id === target.organization_id &&
      device.provider === "expo" && device.push_token.startsWith("ExponentPushToken[")
    ).map((device) => device.push_token))];
    if (!tokens.length) continue;
    // Atomic unique claim ensures retries or concurrent invocations do not double-send.
    const { data: claim, error: claimError } = await admin.from("member_wellbeing_reminder_deliveries")
      .insert({ person_id: target.person_id, organization_id: target.organization_id, reminder_date: date })
      .select("id").maybeSingle();
    if (claimError || !claim) continue;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokens.map((to) => ({
          to, sound: "default", title: "💙 Como está seu coração hoje?",
          body: "Se desejar, registre como você está se sentindo no Elo.",
          data: { screen: "meu-bem-estar", route: "/meu-bem-estar" }
        })))
      });
      if (!response.ok) throw new Error("Push provider unavailable");
      const payload = await response.json() as { data?: { status: string } | { status: string }[] };
      const results = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
      if (!results.length || results.some((item) => item.status !== "ok")) throw new Error("Push provider rejected request");
      await admin.from("member_wellbeing_reminder_deliveries").update({ status: "sent" }).eq("id", claim.id);
      sent++;
    } catch {
      await admin.from("member_wellbeing_reminder_deliveries").update({ status: "failed" }).eq("id", claim.id);
      failed++;
    }
  }
  return NextResponse.json({ checked: opted.length, sent, failed });
}
