"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
type Action = "contacted" | "counseling" | "visit_planned" | "closed";
export function PastoralFollowup({ checkinId, organizationId, pastorPersonId }: {
  checkinId: string; organizationId: string; pastorPersonId: string;
}) {
  const [action, setAction] = useState<Action>("contacted");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setSaving(true); setMessage("");
    const { error } = await createClient().from("member_wellbeing_followups").insert({
      checkin_id: checkinId, organization_id: organizationId, created_by: pastorPersonId, action
    });
    setMessage(error ? "Não foi possível registrar o acompanhamento." : "Acompanhamento registrado.");
    setSaving(false);
  }
  return <div className="mt-3 flex flex-wrap items-center gap-2">
    <select aria-label="Ação pastoral" className="rounded-lg border p-2" value={action}
      onChange={(event) => setAction(event.target.value as Action)}>
      <option value="contacted">Contato realizado</option>
      <option value="counseling">Aconselhamento</option>
      <option value="visit_planned">Visita planejada</option>
      <option value="closed">Acompanhamento concluído</option>
    </select>
    <button disabled={saving} type="button" onClick={() => void save()}
      className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-50">
      {saving ? "Salvando..." : "Registrar"}
    </button>
    {message && <span role="status" className="text-xs">{message}</span>}
  </div>;
}
