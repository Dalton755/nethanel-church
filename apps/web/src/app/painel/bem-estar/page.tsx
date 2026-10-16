"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { findPastoralAlerts } from "@/features/wellbeing/alerts";
import { PastoralFollowup } from "@/features/wellbeing/PastoralFollowup";

type Church = { id: string; name: string; person?: { id: string }; roles?: { role_key: string; is_owner?: boolean }[] };
type Checkin = { id: string; checkin_date: string; person_id: string; emotional: number | null; financial: number | null; sentimental: number | null; spiritual: number | null; wants_contact: boolean; note: string | null };
const areas = ["emotional", "financial", "sentimental", "spiritual"] as const;
const labels = ["Emocional", "Financeiro", "Sentimental", "Espiritual"];

export default function PainelPastoralBemEstar() {
  const [churches, setChurches] = useState<Church[]>([]);
  const [selected, setSelected] = useState("");
  const [entries, setEntries] = useState<Checkin[]>([]);
  const [error, setError] = useState("");
  const [alertDays, setAlertDays] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadChurches() {
      const client = createClient();
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error("Entre na sua conta.");
      const { data, error: contextError } = await client.rpc("get_my_context");
      if (contextError) throw contextError;
      const permitted = ((data?.organizations ?? []) as Church[]).filter((church) =>
        church.roles?.some((role) => role.role_key === "pastor" || role.role_key === "pastoral"));
      if (active) { setChurches(permitted); setSelected(permitted[0]?.id ?? ""); }
    }
    loadChurches().catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Falha ao carregar."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const client = createClient();
    client.from("member_wellbeing_checkins")
      .select("id,checkin_date,person_id,emotional,financial,sentimental,spiritual,wants_contact,note")
      .eq("organization_id", selected).eq("share_with_pastoral", true)
      .order("checkin_date", { ascending: false }).limit(100)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(queryError.message);
        else { setEntries((data ?? []) as Checkin[]); setError(""); }
      });
    return () => { active = false; };
  }, [selected]);

  const alerts = useMemo(() => findPastoralAlerts(entries, alertDays), [entries, alertDays]);
  const summary = useMemo(() => areas.map((area, index) => {
    const values = entries.map((entry) => entry[area]).filter((value): value is number => value !== null);
    return { label: labels[index], average: values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "—" };
  }), [entries]);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/painel" className="text-sm text-blue-700">← Voltar ao Elo</Link>
      <header><h1 className="text-3xl font-bold">Cuidado pastoral</h1>
        <p className="mt-2 text-sm text-slate-600">Somente registros compartilhados voluntariamente. Indicadores não substituem uma conversa pessoal.</p></header>
      {loading && <p>Verificando permissões...</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && churches.length === 0 && <p>Você não possui uma função pastoral habilitada neste ambiente.</p>}
      {churches.length > 1 && <select className="rounded-xl border p-3" value={selected} onChange={(e) => setSelected(e.target.value)}>
        {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
      </select>}
      {selected && <><section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">Sinais para acompanhamento</h2>
        <p className="mt-1 text-sm text-amber-900">Avaliações 1 ou 2 em dias consecutivos, apenas em registros compartilhados. Não é diagnóstico.</p>
        <label className="mt-3 block text-sm">Critério: <select aria-label="Dias consecutivos" className="rounded-lg border bg-white p-2" value={alertDays} onChange={(event) => setAlertDays(Number(event.target.value))}><option value={2}>2 dias</option><option value={3}>3 dias</option><option value={5}>5 dias</option></select></label>
        <p className="mt-2 text-sm font-medium">{alerts.length === 0 ? "Nenhum padrão recorrente identificado nos registros disponíveis." : `${alerts.length} padrões identificados para revisão pastoral.`}</p>
      </section><section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summary.map((item) => <div key={item.label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">{item.label}</p><strong className="text-3xl">{item.average}</strong><span className="text-sm"> / 5</span></div>)}
      </section><section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Registros compartilhados</h2>
        <p className="mb-4 text-sm text-slate-500">Últimos 100 registros autorizados. Identificação individual não é exibida nesta versão.</p>
        {entries.length === 0 ? <p>Nenhum registro compartilhado disponível.</p> : <ul className="space-y-3">
          {entries.map((entry) => <li key={entry.id} className="rounded-xl border p-4 text-sm">
            <div className="flex justify-between"><time>{entry.checkin_date.split("-").reverse().join("/")}</time>
              {entry.wants_contact && <strong className="text-amber-700">Solicitou conversa</strong>}</div>
            <p className="mt-2">{areas.map((area, index) => labels[index] + ": " + (entry[area] ?? "—")).join(" · ")}</p>
            {entry.note && <p className="mt-2 whitespace-pre-wrap text-slate-600">{entry.note}</p>}
            {churches.find((church) => church.id === selected)?.person?.id && <PastoralFollowup checkinId={entry.id} organizationId={selected} pastorPersonId={churches.find((church) => church.id === selected)!.person!.id} />}
          </li>)}
        </ul>}
      </section></>}
    </div>
  </main>;
}
