"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/client";

type ChurchContext = {
  id: string;
  name: string;
  person?: { id: string };
  units: Array<{ id: string; name: string; is_headquarters: boolean }>;
  roles: Array<{ role_key: string; is_owner: boolean }>;
};
type Service = {
  id: string;
  title: string;
  starts_at: string;
  location_name: string | null;
};
type Assignment = {
  assignment_id: string;
  event_title: string;
  department_name: string;
  role_label: string;
  status: string;
  starts_at: string;
};
type Notice = {
  id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};
type View = "inicio" | "agenda" | "escalas" | "avisos";

const views: Array<{ key: View; title: string }> = [
  { key: "inicio", title: "Início" },
  { key: "agenda", title: "Agenda" },
  { key: "escalas", title: "Minhas escalas" },
  { key: "avisos", title: "Avisos" },
];

const managementRoles = new Set(["owner", "admin", "pastor", "secretario", "tesoureiro", "lider"]);

function formattedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-slate-200 bg-white px-5 py-7 text-sm text-slate-600">{children}</p>;
}

function ListCard({ title, info, detail }: { title: string; info: string; detail?: string | null }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm font-medium text-sky-700">{info}</p>
      {detail ? <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p> : null}
    </article>
  );
}

export default function EloWebPage() {
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [churches, setChurches] = useState<ChurchContext[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("inicio");
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [dataError, setDataError] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    try {
      clientRef.current = createClient();
    } catch {
      setError("A configuração pública do Supabase não está disponível.");
      setLoading(false);
      return;
    }

    async function initialize() {
      const client = clientRef.current;
      if (!client) return;
      try {
        const session = await client.auth.getUser();
        if (session.error) throw session.error;
        if (!active) return;
        setUser(session.data.user);
        if (!session.data.user) return;

        const context = await client.rpc("get_my_context");
        if (context.error) throw context.error;
        if (!active) return;
        const available: ChurchContext[] = Array.isArray(context.data?.organizations)
          ? context.data.organizations
          : [];
        setChurches(available);
        const previous = window.localStorage.getItem("elo-web-organization");
        setSelectedId(available.find((church) => church.id === previous)?.id ?? available[0]?.id ?? "");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as suas igrejas.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
      clientRef.current = null;
    };
  }, []);

  const church = churches.find((item) => item.id === selectedId) ?? null;
  const unit = church?.units?.find((item) => item.is_headquarters) ?? church?.units?.[0];
  const canManage = church?.roles?.some((role) => role.is_owner || managementRoles.has(role.role_key.toLowerCase())) ?? false;

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !selectedId || !user) return;
    let active = true;
    const selectedChurch = churches.find((item) => item.id === selectedId);
    const selectedUnit = selectedChurch?.units?.find((item) => item.is_headquarters) ?? selectedChurch?.units?.[0];

    async function load() {
      setLoadingData(true);
      setDataError("");
      setServices([]);
      setAssignments([]);
      setNotices([]);
      try {
        const now = new Date().toISOString();
        let eventsQuery = client!
          .from("events")
          .select("id,title,starts_at,location_name")
          .eq("organization_id", selectedId)
          .eq("status", "published")
          .gte("starts_at", now)
          .order("starts_at", { ascending: true })
          .limit(15);
        if (selectedUnit) eventsQuery = eventsQuery.eq("unit_id", selectedUnit.id);

        const [eventResult, assignmentResult, noticeResult] = await Promise.all([
          eventsQuery,
          client!.rpc("list_my_schedule", { p_organization_id: selectedId }),
          client!.from("notifications")
            .select("id,title,body,read_at,created_at")
            .eq("organization_id", selectedId)
            .eq("user_id", user!.id)
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        if (!active) return;
        setServices((eventResult.data ?? []) as Service[]);
        const available = Array.isArray(assignmentResult.data) ? (assignmentResult.data as Assignment[]) : [];
        setAssignments(available
          .filter((item) => new Date(item.starts_at).getTime() >= Date.now())
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
          .slice(0, 20));
        setNotices((noticeResult.data ?? []) as Notice[]);

        const problems = [eventResult.error, assignmentResult.error, noticeResult.error]
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .map((item) => item.message);
        if (problems.length) setDataError("Alguns dados não puderam ser carregados: " + problems.join(" • "));
      } catch (cause) {
        if (active) setDataError(cause instanceof Error ? cause.message : "Não foi possível carregar as informações.");
      } finally {
        if (active) setLoadingData(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [selectedId, user, churches, refreshKey]);

  const unread = notices.filter((notice) => !notice.read_at).length;
  const brandColor = church?.name ? "#1479b8" : "#1479b8";

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Carregando seu Elo...</main>;
  }

  if (error) {
    return <main className="mx-auto max-w-xl p-8"><Message>{error}</Message><Link href="/painel" className="mt-5 inline-block font-semibold text-sky-700">Voltar ao painel</Link></main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20">
        <h1 className="text-3xl font-bold text-slate-900">Seu Elo começa aqui</h1>
        <p className="mt-4 text-slate-600">Entre com sua conta para acessar os cultos, compromissos e avisos da sua igreja.</p>
        <Link href="/painel" className="mt-7 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white">Entrar com minha conta</Link>
      </main>
    );
  }

  if (!church) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20">
        <h1 className="text-3xl font-bold">Nenhuma igreja vinculada</h1>
        <p className="mt-4 text-slate-600">Entre em uma igreja pelo código de convite ou cadastre sua comunidade.</p>
        <Link href="/painel" className="mt-7 inline-block rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white">Abrir o Estúdio da Igreja</Link>
      </main>
    );
  }

  function serviceList(items: Service[]) {
    return items.length
      ? items.map((event) => <ListCard key={event.id} title={event.title} info={formattedDate(event.starts_at)} detail={event.location_name} />)
      : <Message>Nenhum culto ou evento publicado para os próximos dias nesta unidade.</Message>;
  }

  function assignmentList(items: Assignment[]) {
    return items.length
      ? items.map((assignment) => (
          <ListCard
            key={assignment.assignment_id}
            title={assignment.event_title}
            info={formattedDate(assignment.starts_at)}
            detail={[assignment.department_name, assignment.role_label, assignment.status].filter(Boolean).join(" • ")}
          />
        ))
      : <Message>Nenhum compromisso futuro encontrado para sua conta.</Message>;
  }

  function noticeList(items: Notice[]) {
    return items.length
      ? items.map((notice) => (
          <ListCard
            key={notice.id}
            title={(notice.read_at ? "" : "● ") + notice.title}
            info={formattedDate(notice.created_at)}
            detail={notice.body}
          />
        ))
      : <Message>Você ainda não tem avisos nesta igreja.</Message>;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-700">Nethanel Tecnologia</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Elo <span className="font-normal text-slate-500">| Minha igreja</span></h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {churches.length > 1 ? (
              <select
                aria-label="Selecionar igreja"
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  window.localStorage.setItem("elo-web-organization", event.target.value);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                {churches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            ) : null}
            {canManage ? <Link href="/painel" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold">Estúdio da igreja</Link> : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        <section className="rounded-3xl bg-[#192f42] px-6 py-8 text-white sm:px-9">
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold">Versão web em integração • leitura</span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight">{church.name}</h2>
          <p className="mt-2 text-sm text-slate-200">{unit?.name ?? "Comunidade"} • Acesso conectado à sua conta existente</p>
          <div className="mt-5 h-1 w-28 rounded-full" style={{ backgroundColor: brandColor }} />
        </section>

        <nav aria-label="Seções do Elo" className="mt-6 flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              aria-current={view === item.key ? "page" : undefined}
              className={view === item.key
                ? "rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
                : "rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"}
            >
              {item.title}{item.key === "avisos" && unread ? " (" + unread + ")" : ""}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
          >
            Atualizar
          </button>
        </nav>

        {dataError ? <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{dataError}</p> : null}
        {loadingData ? <p className="mt-5 text-sm text-slate-500">Atualizando informações...</p> : null}

        {view === "inicio" ? (
          <div className="mt-6 space-y-7">
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">Próximos cultos e eventos</p><p className="mt-2 text-3xl font-extrabold">{services.length}</p></div>
              <div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">Minhas escalas futuras</p><p className="mt-2 text-3xl font-extrabold">{assignments.length}</p></div>
              <div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">Avisos não lidos</p><p className="mt-2 text-3xl font-extrabold">{unread}</p></div>
            </section>
            <section>
              <h3 className="mb-3 text-lg font-bold">Próximo culto ou evento</h3>
              <div className="grid gap-3">{serviceList(services.slice(0, 1))}</div>
            </section>
            <section>
              <h3 className="mb-3 text-lg font-bold">Meu próximo compromisso</h3>
              <div className="grid gap-3">{assignmentList(assignments.slice(0, 1))}</div>
            </section>
            <aside className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm leading-6 text-sky-950">
              Esta primeira etapa é de consulta. Gestão de escalas, Elo Kids, comunicação, financeiro e outros módulos continuam no app atual até serem migrados e validados no navegador.
            </aside>
          </div>
        ) : null}

        {view === "agenda" ? (
          <section className="mt-6">
            <h3 className="mb-3 text-lg font-bold">Agenda da igreja</h3>
            <div className="grid gap-3 sm:grid-cols-2">{serviceList(services)}</div>
          </section>
        ) : null}

        {view === "escalas" ? (
          <section className="mt-6">
            <h3 className="mb-3 text-lg font-bold">Minhas próximas escalas</h3>
            <div className="grid gap-3 sm:grid-cols-2">{assignmentList(assignments)}</div>
          </section>
        ) : null}

        {view === "avisos" ? (
          <section className="mt-6">
            <h3 className="mb-3 text-lg font-bold">Avisos e notificações</h3>
            <div className="grid gap-3">{noticeList(notices)}</div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
