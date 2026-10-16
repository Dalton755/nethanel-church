"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ReminderPreference({ organizationId, personId }: { organizationId: string; personId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    createClient().from("member_wellbeing_preferences").select("daily_reminder_enabled")
      .eq("organization_id", organizationId).eq("person_id", personId).maybeSingle()
      .then(({ data, error: failure }) => {
        if (!active) return;
        if (failure) setError("Não foi possível carregar sua preferência.");
        else setEnabled(data?.daily_reminder_enabled ?? false);
        setLoading(false);
      });
    return () => { active = false; };
  }, [organizationId, personId]);
  async function change(value: boolean) {
    setSaving(true); setError(""); setNotice("");
    const { error: failure } = await createClient().from("member_wellbeing_preferences")
      .upsert({ organization_id: organizationId, person_id: personId, daily_reminder_enabled: value, updated_at: new Date().toISOString() }, { onConflict: "person_id" });
    if (failure) setError("Não foi possível salvar sua preferência.");
    else { setEnabled(value); setNotice("Preferência salva."); }
    setSaving(false);
  }
  return <section className="rounded-2xl border bg-white p-5">
    <h3 className="font-semibold">Lembrete diário</h3>
    <p className="mt-1 text-sm text-slate-600">Você pode optar por receber um lembrete às 10h (horário de Brasília). O envio de notificações será ativado após a configuração do serviço de push.</p>
    <label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={enabled} disabled={loading || saving} onChange={(event) => void change(event.target.checked)} /> Quero receber o lembrete diário</label>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-2 text-sm text-green-700">{notice}</p>}
  </section>;
}
