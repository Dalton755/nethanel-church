"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InfrastructureCost = {
  id: string;
  provider_key: string;
  provider_name: string;
  service_name: string;
  plan_name: string | null;
  billing_cycle: string;
  amount: number | string;
  currency: string;
  amount_kind: "ACTUAL" | "ESTIMATED" | "BASE" | "MANUAL";
  next_charge_date: string | null;
  billing_day: number | null;
  status: string;
  source: string;
  source_detail: string | null;
  active_projects: number | null;
  notes: string | null;
  last_checked_at: string | null;
  updated_at: string;
};

type Draft = {
  amount: string;
  next_charge_date: string;
  billing_day: string;
};

type ExchangeRate = {
  pair: string;
  rate: number;
  rate_date: string;
  source: string;
};

type BillingAlert = {
  item: InfrastructureCost;
  days: number;
  kind: "OVERDUE" | "TODAY" | "SOON";
};

const kindLabels: Record<InfrastructureCost["amount_kind"], string> = {
  ACTUAL: "Valor real",
  ESTIMATED: "Estimativa",
  BASE: "Valor-base",
  MANUAL: "Informado manualmente",
};

function money(value: number | string, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function rateBr(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

function dateBr(value: string | null) {
  if (!value) return "Não informado";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function daysUntil(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function alertLabel(alert: BillingAlert) {
  if (alert.kind === "OVERDUE") {
    const days = Math.abs(alert.days);
    return `Vencimento em atraso há ${days} ${days === 1 ? "dia" : "dias"}`;
  }
  if (alert.kind === "TODAY") return "Vence hoje";
  return `Vence em ${alert.days} ${alert.days === 1 ? "dia" : "dias"}`;
}

export default function InfrastructureClient() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<InfrastructureCost[]>([]);
  const [exchange, setExchange] = useState<ExchangeRate | null>(null);
  const [exchangeLoading, setExchangeLoading] = useState(true);
  const [exchangeError, setExchangeError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingDue, setSavingDue] = useState<string | null>(null);
  const [dueDrafts, setDueDrafts] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft>({
    amount: "",
    next_charge_date: "",
    billing_day: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase
      .from("nethanel_infrastructure_costs")
      .select("*")
      .order("provider_name");

    if (error) {
      setMessage(error.message);
      setItems([]);
    } else {
      const loaded = (data ?? []) as InfrastructureCost[];
      setItems(loaded);
      setDueDrafts(
        Object.fromEntries(
          loaded.map((item) => [item.id, item.next_charge_date?.slice(0, 10) ?? ""])
        )
      );
    }
    setLoading(false);
  }, [supabase]);

  const loadExchange = useCallback(async () => {
    setExchangeLoading(true);
    setExchangeError("");

    try {
      const response = await fetch("/api/gerencial/cotacao", {
        cache: "no-store",
      });
      const payload = (await response.json()) as ExchangeRate & { error?: string };

      if (!response.ok || !Number.isFinite(Number(payload.rate))) {
        throw new Error(payload.error || "Cotação indisponível.");
      }

      setExchange({
        pair: payload.pair,
        rate: Number(payload.rate),
        rate_date: payload.rate_date,
        source: payload.source,
      });
    } catch (error) {
      setExchange(null);
      setExchangeError(
        error instanceof Error ? error.message : "Cotação indisponível."
      );
    }

    setExchangeLoading(false);
  }, []);

  useEffect(() => {
    void Promise.all([load(), loadExchange()]);
  }, [load, loadExchange]);

  const totals = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const item of items) {
      if (item.status !== "ACTIVE") continue;
      grouped.set(
        item.currency,
        (grouped.get(item.currency) ?? 0) + Number(item.amount || 0)
      );
    }
    return Array.from(grouped.entries());
  }, [items]);

  const totalBrl = useMemo(() => {
    return items.reduce((sum, item) => {
      if (item.status !== "ACTIVE") return sum;
      const amount = Number(item.amount || 0);
      if (item.currency === "BRL") return sum + amount;
      if (item.currency === "USD" && exchange?.rate) return sum + amount * exchange.rate;
      return sum;
    }, 0);
  }, [items, exchange]);

  const hasConvertibleCosts = useMemo(
    () =>
      items.some(
        (item) =>
          item.status === "ACTIVE" &&
          (item.currency === "BRL" ||
            (item.currency === "USD" && Boolean(exchange?.rate)))
      ),
    [items, exchange]
  );

  const billingAlerts = useMemo<BillingAlert[]>(() => {
    return items
      .filter((item) => item.status === "ACTIVE" && item.next_charge_date)
      .map((item) => {
        const days = daysUntil(item.next_charge_date as string);
        const kind: BillingAlert["kind"] =
          days < 0 ? "OVERDUE" : days === 0 ? "TODAY" : "SOON";
        return { item, days, kind };
      })
      .filter((alert) => alert.days <= 7)
      .sort((a, b) => a.days - b.days);
  }, [items]);

  const overdueCount = billingAlerts.filter((alert) => alert.kind === "OVERDUE").length;
  const upcomingCount = billingAlerts.filter((alert) => alert.kind !== "OVERDUE").length;

  function convertedToBrl(item: InfrastructureCost) {
    const amount = Number(item.amount || 0);
    if (item.currency === "BRL") return amount;
    if (item.currency === "USD" && exchange?.rate) return amount * exchange.rate;
    return null;
  }

  function startEdit(item: InfrastructureCost) {
    setEditing(item.id);
    setMessage("");
    setDraft({
      amount: String(item.amount ?? ""),
      next_charge_date: item.next_charge_date?.slice(0, 10) ?? "",
      billing_day: item.billing_day ? String(item.billing_day) : "",
    });
  }

  async function saveDueDate(item: InfrastructureCost) {
    const value = dueDrafts[item.id] || "";
    if (!value) {
      setMessage(`Informe o vencimento de ${item.service_name}.`);
      return;
    }

    const billingDay = item.billing_cycle === "MONTHLY" ? Number(value.slice(8, 10)) : item.billing_day;
    setSavingDue(item.id);
    setMessage("");

    const { error } = await supabase
      .from("nethanel_infrastructure_costs")
      .update({
        next_charge_date: value,
        billing_day: billingDay,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`${item.service_name}: vencimento salvo para ${dateBr(value)}.`);
      await load();
    }
    setSavingDue(null);
  }

  async function saveManual(item: InfrastructureCost) {
    const amount = Number(draft.amount);
    const billingDay = draft.billing_day ? Number(draft.billing_day) : null;

    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Informe um valor válido.");
      return;
    }
    if (billingDay !== null && (billingDay < 1 || billingDay > 31)) {
      setMessage("O dia recorrente deve estar entre 1 e 31.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase
      .from("nethanel_infrastructure_costs")
      .update({
        amount,
        amount_kind: "MANUAL",
        next_charge_date: draft.next_charge_date || null,
        billing_day: billingDay,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`${item.service_name}: cobrança real atualizada.`);
      setEditing(null);
      await load();
    }
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/gerencial"
              className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300 hover:text-sky-200"
            >
              ← Central Nethanel
            </Link>
            <h1 className="mt-3 text-3xl font-bold">Custos de infraestrutura</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Assinaturas e serviços usados para manter os produtos Nethanel. A
              origem do valor fica identificada para não misturar fatura real,
              estimativa e preço-base público.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void Promise.all([load(), loadExchange()])}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/5"
          >
            Atualizar dados
          </button>
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
            {message}
          </div>
        ) : null}

        {billingAlerts.length > 0 ? (
          <section className="mt-5 rounded-[1.6rem] border border-amber-400/20 bg-amber-400/[0.05] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300/80">
                  Alertas de vencimento
                </p>
                <h2 className="mt-1 text-lg font-bold">Atenção com os próximos pagamentos</h2>
              </div>
              <div className="flex gap-2 text-xs font-bold">
                {overdueCount > 0 ? (
                  <span className="rounded-full bg-rose-400/10 px-3 py-1.5 text-rose-300">
                    {overdueCount} em atraso
                  </span>
                ) : null}
                {upcomingCount > 0 ? (
                  <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-amber-300">
                    {upcomingCount} próximos
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {billingAlerts.map((alert) => (
                <div
                  key={alert.item.id}
                  className={
                    "rounded-2xl border p-4 " +
                    (alert.kind === "OVERDUE"
                      ? "border-rose-400/20 bg-rose-400/[0.06]"
                      : "border-amber-400/15 bg-black/15")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{alert.item.service_name}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Vencimento {dateBr(alert.item.next_charge_date)}
                      </p>
                    </div>
                    <span
                      className={
                        "rounded-full px-2.5 py-1 text-[10px] font-bold " +
                        (alert.kind === "OVERDUE"
                          ? "bg-rose-400/10 text-rose-300"
                          : "bg-amber-400/10 text-amber-300")
                      }
                    >
                      {alertLabel(alert)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              O alerta considera a data de vencimento registrada. Se a cobrança já foi paga ou renovada, atualize a próxima data.
            </p>
          </section>
        ) : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.04] p-5">
            <p className="text-xs font-semibold text-zinc-500">Serviços acompanhados</p>
            <p className="mt-2 text-3xl font-bold">{items.length}</p>
            <p className="mt-1 text-xs text-zinc-600">infraestrutura corporativa</p>
          </div>

          <div className="rounded-[1.5rem] border border-emerald-400/15 bg-emerald-400/[0.06] p-5">
            <p className="text-xs font-semibold text-emerald-200/70">Total de infraestrutura</p>
            <p className="mt-2 text-3xl font-bold text-emerald-100">
              {hasConvertibleCosts && exchange ? money(totalBrl, "BRL") : "—"}
            </p>
            <p className="mt-1 text-xs text-emerald-200/50">custo mensal convertido em reais</p>
          </div>

          <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.04] p-5">
            <p className="text-xs font-semibold text-zinc-500">Moedas originais</p>
            <div className="mt-2 space-y-1">
              {totals.length === 0 ? (
                <p className="text-2xl font-bold">—</p>
              ) : (
                totals.map(([currency, total]) => (
                  <p key={currency} className="text-2xl font-bold">
                    {money(total, currency)}
                  </p>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-600">antes da conversão cambial</p>
          </div>

          <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.04] p-5">
            <p className="text-xs font-semibold text-zinc-500">Cotação USD/BRL</p>
            <p className="mt-2 text-3xl font-bold">
              {exchangeLoading ? "..." : exchange ? `R$ ${rateBr(exchange.rate)}` : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {exchange
                ? `${exchange.source} · ${dateBr(exchange.rate_date)}`
                : exchangeError || "Aguardando cotação"}
            </p>
          </div>
        </section>

        <p className="mt-3 text-xs text-amber-300/80">
          O total em reais usa a cotação USD/BRL mais recente disponível. A soma
          inclui valores reais, manuais, estimados e valores-base conforme a
          classificação de cada serviço.
        </p>

        {loading ? (
          <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-white/[0.035] p-6 text-sm text-zinc-500">
            Carregando custos...
          </div>
        ) : (
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {items.map((item) => {
              const isEditing = editing === item.id;
              const converted = convertedToBrl(item);
              const alert = billingAlerts.find((current) => current.item.id === item.id);

              return (
                <article
                  key={item.id}
                  className="rounded-[1.7rem] border border-white/8 bg-gradient-to-br from-white/[0.07] to-white/[0.025] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                        {item.provider_name}
                      </p>
                      <h2 className="mt-1 text-xl font-bold">{item.service_name}</h2>
                      <p className="mt-1 text-sm text-zinc-500">
                        Plano {item.plan_name || "não identificado"} · {item.billing_cycle === "MONTHLY" ? "mensal" : item.billing_cycle}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                      {item.status === "ACTIVE" ? "ATIVO" : item.status}
                    </span>
                  </div>

                  {alert ? (
                    <div
                      className={
                        "mt-4 rounded-xl border px-3 py-2.5 text-xs font-bold " +
                        (alert.kind === "OVERDUE"
                          ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-300"
                          : "border-amber-400/20 bg-amber-400/[0.06] text-amber-300")
                      }
                    >
                      {alertLabel(alert)} · vencimento {dateBr(item.next_charge_date)}
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-zinc-500">Custo acompanhado</p>
                        <p className="mt-1 text-3xl font-bold">{money(item.amount, item.currency)}</p>
                        {converted !== null && item.currency !== "BRL" ? (
                          <p className="mt-1 text-sm font-semibold text-emerald-300">
                            ≈ {money(converted, "BRL")}
                          </p>
                        ) : item.currency === "BRL" ? (
                          <p className="mt-1 text-sm font-semibold text-emerald-300">
                            {money(converted ?? 0, "BRL")}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-zinc-600">Conversão indisponível</p>
                        )}
                      </div>
                      <span
                        className={
                          "rounded-full px-2.5 py-1 text-[10px] font-bold " +
                          (item.amount_kind === "ACTUAL" || item.amount_kind === "MANUAL"
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-amber-400/10 text-amber-300")
                        }
                      >
                        {kindLabels[item.amount_kind]}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                      <p className="text-[11px] text-zinc-600">Próxima cobrança</p>
                      {item.next_charge_date ? (
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{dateBr(item.next_charge_date)}</p>
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="text-[10px] font-bold text-sky-300"
                          >
                            Alterar
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <p className="text-[11px] leading-4 text-amber-300/80">
                            A API não informou. Digite o vencimento:
                          </p>
                          <input
                            type="date"
                            value={dueDrafts[item.id] ?? ""}
                            onChange={(event) =>
                              setDueDrafts((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-xs text-white outline-none focus:border-sky-400/50"
                          />
                          <button
                            type="button"
                            disabled={savingDue === item.id}
                            onClick={() => void saveDueDate(item)}
                            className="w-full rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold text-zinc-950 disabled:opacity-50"
                          >
                            {savingDue === item.id ? "Salvando..." : "Salvar vencimento"}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                      <p className="text-[11px] text-zinc-600">Dia recorrente</p>
                      <p className="mt-1 text-sm font-semibold">
                        {item.billing_day ? `Dia ${item.billing_day}` : "Não identificado"}
                      </p>
                    </div>
                    {item.active_projects !== null ? (
                      <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                        <p className="text-[11px] text-zinc-600">Projetos ativos</p>
                        <p className="mt-1 text-sm font-semibold">{item.active_projects}</p>
                      </div>
                    ) : null}
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                      <p className="text-[11px] text-zinc-600">Última verificação</p>
                      <p className="mt-1 text-sm font-semibold">{dateTime(item.last_checked_at)}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">Origem do dado</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{item.source_detail || item.source}</p>
                    {item.notes ? <p className="mt-2 text-xs leading-5 text-zinc-600">{item.notes}</p> : null}
                  </div>

                  {isEditing ? (
                    <div className="mt-4 rounded-2xl border border-sky-400/15 bg-sky-400/[0.05] p-4">
                      <p className="text-sm font-bold">Atualizar cobrança real</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-xs text-zinc-500">
                          Valor ({item.currency})
                          <input
                            value={draft.amount}
                            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50"
                          />
                        </label>
                        <label className="text-xs text-zinc-500">
                          Vencimento
                          <input
                            value={draft.next_charge_date}
                            onChange={(event) => setDraft({ ...draft, next_charge_date: event.target.value })}
                            type="date"
                            className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50"
                          />
                        </label>
                        <label className="text-xs text-zinc-500">
                          Dia recorrente
                          <input
                            value={draft.billing_day}
                            onChange={(event) => setDraft({ ...draft, billing_day: event.target.value })}
                            type="number"
                            min="1"
                            max="31"
                            className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50"
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveManual(item)}
                          className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-zinc-950 disabled:opacity-50"
                        >
                          {saving ? "Salvando..." : "Salvar cobrança"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-zinc-400"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : item.next_charge_date ? (
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-zinc-300 hover:bg-white/[0.07]"
                    >
                      Editar fatura / vencimento
                    </button>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
