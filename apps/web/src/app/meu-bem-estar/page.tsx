"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { WellbeingMemberPanel } from "@/features/wellbeing/WellbeingMemberPanel";

type ChurchContext = { id: string; name: string; person: { id: string } };

export default function MeuBemEstarPage() {
  const [churches, setChurches] = useState<ChurchContext[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const client = createClient();
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw new Error("Entre na sua conta para continuar.");
      const { data, error: contextError } = await client.rpc("get_my_context");
      if (contextError) throw contextError;
      const options = (Array.isArray(data?.organizations) ? data.organizations : [])
        .filter((church: ChurchContext) => church.id && church.person?.id) as ChurchContext[];
      if (active) {
        setChurches(options);
        setSelected(options[0]?.id ?? "");
      }
    }
    initialize().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar suas igrejas.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const church = churches.find((option) => option.id === selected);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto mb-6 max-w-xl">
        <Link href="/painel" className="text-sm text-blue-700">← Voltar ao Elo</Link>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Meu bem-estar</h1>
        <p className="mt-2 text-sm text-slate-600">Participação voluntária. Seus registros são privados nesta etapa.</p>
      </div>
      {loading && <p className="mx-auto max-w-xl">Carregando...</p>}
      {error && <p role="alert" className="mx-auto max-w-xl text-red-700">{error}</p>}
      {!loading && !error && churches.length === 0 && <p className="mx-auto max-w-xl">Seu cadastro ainda não está vinculado a uma igreja.</p>}
      {churches.length > 1 && (
        <label className="mx-auto mb-4 block max-w-xl text-sm">Igreja
          <select value={selected} onChange={(event) => setSelected(event.target.value)}
            className="mt-2 w-full rounded-xl border p-3">
            {churches.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
      )}
      {church && <div className="mx-auto max-w-xl" key={church.id}>
        <WellbeingMemberPanel organizationId={church.id} personId={church.person.id} />
      </div>}
    </main>
  );
}
