"use client";

import { useEffect, useState } from "react";
import { WellbeingCheckIn } from "./WellbeingCheckIn";
import { loadWellbeingHistory, saveWellbeing } from "./repository";
import type { WellbeingAnswers } from "./model";

type Entry = {
  checkin_date: string;
  emotional: number | null;
  financial: number | null;
  sentimental: number | null;
  spiritual: number | null;
  wants_contact: boolean;
  note: string | null;
  share_with_pastoral: boolean;
};

export function WellbeingMemberPanel({ organizationId, personId }: {
  organizationId: string;
  personId: string;
}) {
  const [history, setHistory] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());

  async function refresh() {
    const entries = await loadWellbeingHistory(organizationId, personId);
    setHistory(entries as Entry[]);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadWellbeingHistory(organizationId, personId)
      .then((entries) => { if (active) setHistory(entries as Entry[]); })
      .catch(() => { if (active) setError("Não foi possível carregar seu histórico."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, personId]);

  const current = history.find((entry) => entry.checkin_date === today);
  const initialAnswers: WellbeingAnswers = current ? {
    ...(current.emotional != null ? { emotional: current.emotional as 1 | 2 | 3 | 4 | 5 } : {}),
    ...(current.financial != null ? { financial: current.financial as 1 | 2 | 3 | 4 | 5 } : {}),
    ...(current.sentimental != null ? { sentimental: current.sentimental as 1 | 2 | 3 | 4 | 5 } : {}),
    ...(current.spiritual != null ? { spiritual: current.spiritual as 1 | 2 | 3 | 4 | 5 } : {}),
  } : {};

  return (
    <section className="space-y-6">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading ? <p>Carregando seu registro...</p> : (
        <WellbeingCheckIn key={today + String(history.length > 0)} initialAnswers={initialAnswers}
          onSave={async (answers, wantsContact, note, shareWithPastoral) => {
            await saveWellbeing(organizationId, personId, today, answers, wantsContact, note, shareWithPastoral);
            await refresh();
          }} />
      )}
      <div className="rounded-2xl border p-4">
        <h3 className="font-semibold">Meu histórico</h3>
        {history.length === 0 ? <p className="mt-2 text-sm">Nenhum registro ainda.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((entry) => <li key={entry.checkin_date} className="rounded-lg bg-slate-50 p-3">
              <time>{entry.checkin_date.split("-").reverse().join("/")}</time>
              <span className="ml-2">Emocional: {entry.emotional ?? "—"} · Financeiro: {entry.financial ?? "—"} · Sentimental: {entry.sentimental ?? "—"} · Espiritual: {entry.spiritual ?? "—"}</span>
            </li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
