"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Customer,
  FinanceEntry,
  Lead,
  Metric,
  Plan,
  Product,
  SyncStatus,
  Tab,
  dateTime,
  money,
  numberBr,
  stageLabels,
  tabs,
} from "./types";
import { Empty, Field, Kpi, Mini, inputClass } from "./ui";

export default function GerencialClient({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("visao");
  const [products, setProducts] = useState<Product[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [finance, setFinance] = useState<FinanceEntry[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [syncs, setSyncs] = useState<SyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  const [leadForm, setLeadForm] = useState({
    name: "",
    phone: "",
    email: "",
    product_id: "",
    stage: "LEAD",
    potential_value: "",
    source: "",
  });

  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
    customer_type: "PESSOA",
    status: "ATIVO",
    source: "",
  });

  const [financeForm, setFinanceForm] = useState({
    product_id: "",
    entry_type: "RECEITA",
    category: "",
    description: "",
    amount: "",
    occurred_at: new Date().toISOString().slice(0, 10),
    status: "CONFIRMADO",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const responses = await Promise.all([
      supabase.from("nethanel_products").select("*").order("display_order"),
      supabase
        .from("nethanel_product_metrics")
        .select("*")
        .order("snapshot_at", { ascending: false }),
      supabase.from("nethanel_product_plans").select("*").order("name"),
      supabase
        .from("nethanel_leads")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("nethanel_customers")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("nethanel_financial_entries")
        .select("*")
        .order("occurred_at", { ascending: false }),
      supabase
        .from("nethanel_alerts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("nethanel_sync_status").select("*"),
    ]);

    const firstError = responses.find((response) => response.error)?.error;
    const loadedProducts = (responses[0].data ?? []) as Product[];
    if (firstError || loadedProducts.length === 0) {
      setAccessDenied(true);
      setMessage("Acesso restrito ou falha ao carregar os dados da Central.");
      setLoading(false);
      return;
    }

    setProducts(loadedProducts);
    setMetrics((responses[1].data ?? []) as Metric[]);
    setPlans((responses[2].data ?? []) as Plan[]);
    setLeads((responses[3].data ?? []) as Lead[]);
    setCustomers((responses[4].data ?? []) as Customer[]);
    setFinance((responses[5].data ?? []) as FinanceEntry[]);
    setAlerts((responses[6].data ?? []) as Alert[]);
    setSyncs((responses[7].data ?? []) as SyncStatus[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const latestMetrics = useMemo(() => {
    const map = new Map<string, Metric>();
    for (const metric of metrics) {
      if (!map.has(metric.product_id)) map.set(metric.product_id, metric);
    }
    return map;
  }, [metrics]);

  const summary = useMemo(() => {
    const latest = Array.from(latestMetrics.values());
    return {
      revenueTotal: latest.reduce(
        (sum, item) => sum + Number(item.revenue_total || 0),
        0
      ),
      mrr: latest.reduce((sum, item) => sum + Number(item.mrr || 0), 0),
      customers: latest.reduce(
        (sum, item) => sum + Number(item.customers_total || 0),
        0
      ),
      paying: latest.reduce(
        (sum, item) => sum + Number(item.paying_customers || 0),
        0
      ),
    };
  }, [latestMetrics]);

  const financeSummary = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const item of finance) {
      if (item.status !== "CONFIRMADO") continue;
      const value = Number(item.amount || 0);
      if (item.entry_type === "RECEITA") entradas += value;
      else saidas += value;
    }
    return { entradas, saidas, resultado: entradas - saidas };
  }, [finance]);

  const pipelineValue = leads
    .filter((item) => item.stage !== "PERDIDO")
    .reduce((sum, item) => sum + Number(item.potential_value || 0), 0);

  const openAlerts = alerts.filter((item) => item.status === "ABERTO");

  function productName(productId: string | null) {
    return (
      products.find((product) => product.id === productId)?.name ?? "Nethanel"
    );
  }

  async function addLead(event: FormEvent) {
    event.preventDefault();
    setSaving("lead");
    setMessage("");

    const { error } = await supabase.from("nethanel_leads").insert({
      name: leadForm.name.trim(),
      phone: leadForm.phone.trim() || null,
      email: leadForm.email.trim() || null,
      product_id: leadForm.product_id || null,
      stage: leadForm.stage,
      potential_value: Number(leadForm.potential_value || 0),
      source: leadForm.source.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setLeadForm({
        name: "",
        phone: "",
        email: "",
        product_id: "",
        stage: "LEAD",
        potential_value: "",
        source: "",
      });
      setMessage("Lead salvo.");
      await loadData();
    }
    setSaving("");
  }

  async function addCustomer(event: FormEvent) {
    event.preventDefault();
    setSaving("customer");
    setMessage("");

    const { error } = await supabase.from("nethanel_customers").insert({
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim() || null,
      email: customerForm.email.trim() || null,
      customer_type: customerForm.customer_type,
      status: customerForm.status,
      source: customerForm.source.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setCustomerForm({
        name: "",
        phone: "",
        email: "",
        customer_type: "PESSOA",
        status: "ATIVO",
        source: "",
      });
      setMessage("Cliente salvo.");
      await loadData();
    }
    setSaving("");
  }

  async function addFinance(event: FormEvent) {
    event.preventDefault();
    setSaving("finance");
    setMessage("");

    const { error } = await supabase.from("nethanel_financial_entries").insert({
      product_id: financeForm.product_id || null,
      entry_type: financeForm.entry_type,
      category: financeForm.category.trim(),
      description: financeForm.description.trim() || null,
      amount: Number(financeForm.amount || 0),
      occurred_at: financeForm.occurred_at,
      status: financeForm.status,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setFinanceForm({
        product_id: "",
        entry_type: "RECEITA",
        category: "",
        description: "",
        amount: "",
        occurred_at: new Date().toISOString().slice(0, 10),
        status: "CONFIRMADO",
      });
      setMessage("Lançamento salvo.");
      await loadData();
    }
    setSaving("");
  }

  async function updateLeadStage(id: string, stage: string) {
    setSaving(id);
    const { error } = await supabase
      .from("nethanel_leads")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) setMessage(error.message);
    else await loadData();
    setSaving("");
  }

  async function savePlan(plan: Plan) {
    setSaving(plan.id);
    setMessage("");

    const { error } = await supabase
      .from("nethanel_product_plans")
      .update({
        name: plan.name,
        price: Number(plan.price || 0),
        active: plan.active,
        trial_enabled: plan.trial_enabled,
        trial_days: Number(plan.trial_days || 0),
        limits: plan.limits ?? {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Configuração comercial salva na Central.");
      await loadData();
    }
    setSaving("");
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/gerencial/login";
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-300">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm">
          Carregando Central Nethanel...
        </div>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-5 text-white">
        <section className="max-w-md rounded-[2rem] border border-red-400/20 bg-red-400/10 p-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
            Acesso restrito
          </p>
          <h1 className="mt-3 text-2xl font-bold">Central Gerencial Nethanel</h1>
          <p className="mt-3 text-sm leading-6 text-red-100/80">
            Este usuário não possui permissão administrativa.
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-6 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-zinc-950"
          >
            Sair
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-white/8 bg-black/20 px-4 py-6 lg:flex lg:flex-col">
          <div className="px-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-300">
              Nethanel
            </p>
            <h1 className="mt-2 text-xl font-bold">Central Gerencial</h1>
          </div>

          <nav className="mt-8 space-y-1">
            {tabs.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setTab(item.id)}
                className={
                  "w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition " +
                  (tab === item.id
                    ? "bg-white text-zinc-950"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white")
                }
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.04] p-3">
            <p className="truncate text-xs text-zinc-500">{userEmail}</p>
            <button
              type="button"
              onClick={logout}
              className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300"
            >
              Sair
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-white/8 bg-[#09090b]/90 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-zinc-500">
                  Nethanel Tecnologia
                </p>
                <h2 className="mt-0.5 text-lg font-bold">
                  {tabs.find((item) => item.id === tab)?.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void loadData()}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300"
              >
                Atualizar
              </button>
            </div>

            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {tabs.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={
                    "shrink-0 rounded-full px-3 py-2 text-xs font-bold " +
                    (tab === item.id
                      ? "bg-white text-zinc-950"
                      : "border border-white/10 text-zinc-400")
                  }
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">
            {message ? (
              <div className="mb-5 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                {message}
              </div>
            ) : null}

            {tab === "visao" ? (
              <div className="space-y-6">
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Kpi
                    label="Receita registrada"
                    value={money(summary.revenueTotal)}
                    detail="Snapshots atuais dos produtos"
                  />
                  <Kpi
                    label="MRR contratado"
                    value={money(summary.mrr)}
                    detail="Receita recorrente mensal"
                  />
                  <Kpi
                    label="Clientes / contas"
                    value={numberBr(summary.customers)}
                    detail={numberBr(summary.paying) + " pagantes identificados"}
                  />
                  <Kpi
                    label="Pipeline comercial"
                    value={money(pipelineValue)}
                    detail={numberBr(leads.length) + " oportunidades registradas"}
                  />
                </section>

                <section>
                  <div className="mb-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                      Portfólio
                    </p>
                    <h3 className="mt-1 text-xl font-bold">Saúde dos produtos</h3>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {products.map((product) => {
                      const metric = latestMetrics.get(product.id);
                      const sync = syncs.find(
                        (item) => item.product_id === product.id
                      );
                      return (
                        <article
                          key={product.id}
                          className="rounded-[1.6rem] border border-white/8 bg-gradient-to-br from-white/[0.07] to-white/[0.025] p-5"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-xl font-bold">
                                  {product.name}
                                </h4>
                                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-zinc-300">
                                  {product.status}
                                </span>
                              </div>
                              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                                {product.description}
                              </p>
                            </div>
                            <span
                              className={
                                "mt-1 h-2.5 w-2.5 shrink-0 rounded-full " +
                                (sync?.last_status === "OK"
                                  ? "bg-emerald-400"
                                  : "bg-amber-400")
                              }
                            />
                          </div>

                          <div className="mt-5 grid grid-cols-3 gap-2">
                            <Mini
                              label="Usuários"
                              value={numberBr(metric?.users_total)}
                            />
                            <Mini
                              label="Clientes"
                              value={numberBr(metric?.customers_total)}
                            />
                            <Mini
                              label="Receita"
                              value={money(metric?.revenue_total)}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
                  <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                      Comercial
                    </p>
                    <h3 className="mt-1 text-lg font-bold">Funil de vendas</h3>
                    <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {Object.keys(stageLabels).map((stage) => (
                        <Mini
                          key={stage}
                          label={stageLabels[stage]}
                          value={String(
                            leads.filter((lead) => lead.stage === stage).length
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                      Ação necessária
                    </p>
                    <p className="mt-4 text-4xl font-bold">{openAlerts.length}</p>
                    <p className="mt-1 text-sm text-zinc-500">alertas abertos</p>
                  </div>
                </section>
              </div>
            ) : null}

            {tab === "produtos" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {products.map((product) => {
                  const metric = latestMetrics.get(product.id);
                  const sync = syncs.find(
                    (item) => item.product_id === product.id
                  );
                  const productPlans = plans.filter(
                    (plan) => plan.product_id === product.id
                  );
                  return (
                    <article
                      key={product.id}
                      className="rounded-[1.7rem] border border-white/8 bg-white/[0.035] p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-2xl font-bold">{product.name}</h3>
                          <p className="mt-2 text-sm leading-6 text-zinc-400">
                            {product.description}
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                          {sync?.last_status ?? "PENDENTE"}
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Mini
                          label="Usuários"
                          value={numberBr(metric?.users_total)}
                        />
                        <Mini
                          label="Pagantes"
                          value={numberBr(metric?.paying_customers)}
                        />
                        <Mini
                          label="Assinaturas"
                          value={numberBr(metric?.subscriptions_active)}
                        />
                        <Mini label="MRR" value={money(metric?.mrr)} />
                      </div>

                      <div className="mt-5 border-t border-white/8 pt-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                          Planos
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {productPlans.map((plan) => (
                            <span
                              key={plan.id}
                              className="rounded-full bg-white/6 px-3 py-1.5 text-xs text-zinc-300"
                            >
                              {plan.name + " · " + money(plan.price)}
                            </span>
                          ))}
                        </div>
                        <p className="mt-4 text-xs text-zinc-600">
                          Último snapshot: {dateTime(metric?.snapshot_at)}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {tab === "clientes" ? (
              <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                <form
                  onSubmit={addCustomer}
                  className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5"
                >
                  <h3 className="text-lg font-bold">Novo cliente</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Cadastro corporativo independente do produto.
                  </p>
                  <div className="mt-5 space-y-3">
                    <Field label="Nome">
                      <input
                        required
                        value={customerForm.name}
                        onChange={(e) =>
                          setCustomerForm({
                            ...customerForm,
                            name: e.target.value,
                          })
                        }
                        className={inputClass}
                        placeholder="Nome do cliente ou igreja"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="E-mail">
                        <input
                          value={customerForm.email}
                          onChange={(e) =>
                            setCustomerForm({
                              ...customerForm,
                              email: e.target.value,
                            })
                          }
                          className={inputClass}
                          type="email"
                        />
                      </Field>
                      <Field label="Telefone">
                        <input
                          value={customerForm.phone}
                          onChange={(e) =>
                            setCustomerForm({
                              ...customerForm,
                              phone: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Tipo">
                        <select
                          value={customerForm.customer_type}
                          onChange={(e) =>
                            setCustomerForm({
                              ...customerForm,
                              customer_type: e.target.value,
                            })
                          }
                          className={inputClass}
                        >
                          <option value="PESSOA">Pessoa</option>
                          <option value="IGREJA">Igreja</option>
                          <option value="EMPRESA">Empresa</option>
                        </select>
                      </Field>
                      <Field label="Status">
                        <select
                          value={customerForm.status}
                          onChange={(e) =>
                            setCustomerForm({
                              ...customerForm,
                              status: e.target.value,
                            })
                          }
                          className={inputClass}
                        >
                          <option value="LEAD">Lead</option>
                          <option value="TESTE">Teste</option>
                          <option value="ATIVO">Ativo</option>
                          <option value="INATIVO">Inativo</option>
                          <option value="CANCELADO">Cancelado</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Origem">
                      <input
                        value={customerForm.source}
                        onChange={(e) =>
                          setCustomerForm({
                            ...customerForm,
                            source: e.target.value,
                          })
                        }
                        className={inputClass}
                        placeholder="Indicação, Instagram, grupo..."
                      />
                    </Field>
                  </div>
                  <button
                    disabled={saving === "customer"}
                    className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950"
                  >
                    {saving === "customer" ? "Salvando..." : "Salvar cliente"}
                  </button>
                </form>

                <section className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Clientes Nethanel</h3>
                    <span className="text-xs text-zinc-500">
                      {customers.length} cadastrados
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {customers.length === 0 ? (
                      <Empty text="Nenhum cliente corporativo cadastrado ainda." />
                    ) : (
                      customers.map((customer) => (
                        <div
                          key={customer.id}
                          className="rounded-2xl border border-white/8 bg-black/20 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{customer.name}</p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {customer.email ||
                                  customer.phone ||
                                  "Sem contato informado"}
                              </p>
                            </div>
                            <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-bold">
                              {customer.status}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-zinc-600">
                            {customer.customer_type +
                              " · " +
                              (customer.source || "Origem não informada")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {tab === "comercial" ? (
              <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                <form
                  onSubmit={addLead}
                  className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5"
                >
                  <h3 className="text-lg font-bold">Nova oportunidade</h3>
                  <div className="mt-5 space-y-3">
                    <Field label="Nome">
                      <input
                        required
                        value={leadForm.name}
                        onChange={(e) =>
                          setLeadForm({ ...leadForm, name: e.target.value })
                        }
                        className={inputClass}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Telefone">
                        <input
                          value={leadForm.phone}
                          onChange={(e) =>
                            setLeadForm({ ...leadForm, phone: e.target.value })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="E-mail">
                        <input
                          value={leadForm.email}
                          onChange={(e) =>
                            setLeadForm({ ...leadForm, email: e.target.value })
                          }
                          className={inputClass}
                          type="email"
                        />
                      </Field>
                    </div>
                    <Field label="Produto">
                      <select
                        value={leadForm.product_id}
                        onChange={(e) =>
                          setLeadForm({
                            ...leadForm,
                            product_id: e.target.value,
                          })
                        }
                        className={inputClass}
                      >
                        <option value="">Nethanel / ainda não definido</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Etapa">
                        <select
                          value={leadForm.stage}
                          onChange={(e) =>
                            setLeadForm({ ...leadForm, stage: e.target.value })
                          }
                          className={inputClass}
                        >
                          {Object.entries(stageLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Valor potencial">
                        <input
                          value={leadForm.potential_value}
                          onChange={(e) =>
                            setLeadForm({
                              ...leadForm,
                              potential_value: e.target.value,
                            })
                          }
                          className={inputClass}
                          type="number"
                          min="0"
                          step="0.01"
                        />
                      </Field>
                    </div>
                    <Field label="Origem">
                      <input
                        value={leadForm.source}
                        onChange={(e) =>
                          setLeadForm({ ...leadForm, source: e.target.value })
                        }
                        className={inputClass}
                        placeholder="Instagram, indicação, grupo..."
                      />
                    </Field>
                  </div>
                  <button
                    disabled={saving === "lead"}
                    className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950"
                  >
                    {saving === "lead" ? "Salvando..." : "Adicionar ao CRM"}
                  </button>
                </form>

                <section className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold">Pipeline</h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        Valor potencial: {money(pipelineValue)}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {leads.length} oportunidades
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {leads.length === 0 ? (
                      <Empty text="Nenhuma oportunidade cadastrada." />
                    ) : (
                      leads.map((lead) => (
                        <div
                          key={lead.id}
                          className="rounded-2xl border border-white/8 bg-black/20 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{lead.name}</p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {productName(lead.product_id) +
                                  " · " +
                                  money(lead.potential_value)}
                              </p>
                            </div>
                            <select
                              value={lead.stage}
                              disabled={saving === lead.id}
                              onChange={(e) =>
                                void updateLeadStage(
                                  lead.id,
                                  e.target.value
                                )
                              }
                              className="rounded-xl border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs font-bold outline-none"
                            >
                              {Object.entries(stageLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                          <p className="mt-3 text-xs text-zinc-600">
                            {(lead.phone || lead.email || "Sem contato") +
                              " · " +
                              (lead.source || "Origem não informada")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {tab === "financeiro" ? (
              <div className="space-y-5">
                <section className="grid gap-3 sm:grid-cols-3">
                  <Kpi
                    label="Entradas registradas"
                    value={money(financeSummary.entradas)}
                    detail="Lançamentos confirmados"
                  />
                  <Kpi
                    label="Saídas registradas"
                    value={money(financeSummary.saidas)}
                    detail="Despesas, taxas e reembolsos"
                  />
                  <Kpi
                    label="Resultado gerencial"
                    value={money(financeSummary.resultado)}
                    detail="Entradas menos saídas"
                  />
                </section>

                <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                  <form
                    onSubmit={addFinance}
                    className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5"
                  >
                    <h3 className="text-lg font-bold">Novo lançamento</h3>
                    <div className="mt-5 space-y-3">
                      <Field label="Produto">
                        <select
                          value={financeForm.product_id}
                          onChange={(e) =>
                            setFinanceForm({
                              ...financeForm,
                              product_id: e.target.value,
                            })
                          }
                          className={inputClass}
                        >
                          <option value="">Nethanel / corporativo</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Tipo">
                          <select
                            value={financeForm.entry_type}
                            onChange={(e) =>
                              setFinanceForm({
                                ...financeForm,
                                entry_type: e.target.value,
                              })
                            }
                            className={inputClass}
                          >
                            <option value="RECEITA">Receita</option>
                            <option value="DESPESA">Despesa</option>
                            <option value="TAXA">Taxa</option>
                            <option value="REEMBOLSO">Reembolso</option>
                          </select>
                        </Field>
                        <Field label="Valor">
                          <input
                            required
                            value={financeForm.amount}
                            onChange={(e) =>
                              setFinanceForm({
                                ...financeForm,
                                amount: e.target.value,
                              })
                            }
                            className={inputClass}
                            type="number"
                            min="0"
                            step="0.01"
                          />
                        </Field>
                      </div>
                      <Field label="Categoria">
                        <input
                          required
                          value={financeForm.category}
                          onChange={(e) =>
                            setFinanceForm({
                              ...financeForm,
                              category: e.target.value,
                            })
                          }
                          className={inputClass}
                          placeholder="Assinatura, infraestrutura, marketing..."
                        />
                      </Field>
                      <Field label="Descrição">
                        <input
                          value={financeForm.description}
                          onChange={(e) =>
                            setFinanceForm({
                              ...financeForm,
                              description: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Data">
                          <input
                            value={financeForm.occurred_at}
                            onChange={(e) =>
                              setFinanceForm({
                                ...financeForm,
                                occurred_at: e.target.value,
                              })
                            }
                            className={inputClass}
                            type="date"
                          />
                        </Field>
                        <Field label="Status">
                          <select
                            value={financeForm.status}
                            onChange={(e) =>
                              setFinanceForm({
                                ...financeForm,
                                status: e.target.value,
                              })
                            }
                            className={inputClass}
                          >
                            <option value="CONFIRMADO">Confirmado</option>
                            <option value="PENDENTE">Pendente</option>
                            <option value="CANCELADO">Cancelado</option>
                          </select>
                        </Field>
                      </div>
                    </div>
                    <button
                      disabled={saving === "finance"}
                      className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950"
                    >
                      {saving === "finance"
                        ? "Salvando..."
                        : "Salvar lançamento"}
                    </button>
                  </form>

                  <section className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5">
                    <h3 className="text-lg font-bold">Movimentações</h3>
                    <div className="mt-4 space-y-2">
                      {finance.length === 0 ? (
                        <Empty text="Nenhum lançamento manual registrado ainda." />
                      ) : (
                        finance.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 p-4"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {item.category}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {productName(item.product_id) +
                                  " · " +
                                  item.occurred_at
                                    .split("-")
                                    .reverse()
                                    .join("/")}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={
                                  "font-bold " +
                                  (item.entry_type === "RECEITA"
                                    ? "text-emerald-300"
                                    : "text-rose-300")
                                }
                              >
                                {(item.entry_type === "RECEITA" ? "+ " : "- ") +
                                  money(item.amount)}
                              </p>
                              <p className="mt-1 text-[10px] text-zinc-600">
                                {item.status}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}

            {tab === "planos" ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                    Configuração comercial
                  </p>
                  <h3 className="mt-1 text-xl font-bold">Planos e preços</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                    Ajuste preço, teste gratuito e ativação na Central. A
                    sincronização automática com os bancos de origem será
                    ligada em uma etapa própria.
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {plans.map((plan) => {
                    const product = products.find(
                      (item) => item.id === plan.product_id
                    );
                    return (
                      <article
                        key={plan.id}
                        className="rounded-[1.6rem] border border-white/8 bg-white/[0.035] p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                              {product?.name}
                            </p>
                            <h4 className="mt-1 text-lg font-bold">
                              {plan.name}
                            </h4>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input
                              type="checkbox"
                              checked={plan.active}
                              onChange={(e) =>
                                setPlans((current) =>
                                  current.map((item) =>
                                    item.id === plan.id
                                      ? { ...item, active: e.target.checked }
                                      : item
                                  )
                                )
                              }
                            />
                            Ativo
                          </label>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <Field label="Preço">
                            <input
                              value={String(plan.price)}
                              onChange={(e) =>
                                setPlans((current) =>
                                  current.map((item) =>
                                    item.id === plan.id
                                      ? { ...item, price: e.target.value }
                                      : item
                                  )
                                )
                              }
                              className={inputClass}
                              type="number"
                              min="0"
                              step="0.01"
                            />
                          </Field>
                          <Field label="Cobrança">
                            <div className={inputClass}>{plan.billing_type}</div>
                          </Field>
                          <Field label="Dias de teste">
                            <input
                              value={plan.trial_days}
                              onChange={(e) =>
                                setPlans((current) =>
                                  current.map((item) =>
                                    item.id === plan.id
                                      ? {
                                          ...item,
                                          trial_days: Number(
                                            e.target.value || 0
                                          ),
                                        }
                                      : item
                                  )
                                )
                              }
                              className={inputClass}
                              type="number"
                              min="0"
                            />
                          </Field>
                          <Field label="Teste gratuito">
                            <label
                              className={
                                inputClass +
                                " flex items-center gap-2 text-zinc-300"
                              }
                            >
                              <input
                                type="checkbox"
                                checked={plan.trial_enabled}
                                onChange={(e) =>
                                  setPlans((current) =>
                                    current.map((item) =>
                                      item.id === plan.id
                                        ? {
                                            ...item,
                                            trial_enabled: e.target.checked,
                                          }
                                        : item
                                    )
                                  )
                                }
                              />
                              {plan.trial_enabled ? "Ativado" : "Desativado"}
                            </label>
                          </Field>
                        </div>

                        <button
                          type="button"
                          onClick={() => void savePlan(plan)}
                          disabled={saving === plan.id}
                          className="mt-4 w-full rounded-xl border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-bold"
                        >
                          {saving === plan.id
                            ? "Salvando..."
                            : "Salvar configuração"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {tab === "alertas" ? (
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <Empty text="Nenhum alerta gerencial criado ainda." />
                ) : (
                  alerts.map((alert) => (
                    <article
                      key={alert.id}
                      className="rounded-[1.5rem] border border-white/8 bg-white/[0.035] p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-sky-400/10 px-2 py-1 text-[10px] font-bold text-sky-300">
                              {alert.severity}
                            </span>
                            <span className="text-xs text-zinc-600">
                              {productName(alert.product_id)}
                            </span>
                          </div>
                          <h3 className="mt-3 font-bold">{alert.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-zinc-500">
                            {alert.message}
                          </p>
                        </div>
                        <span className="text-xs text-zinc-600">
                          {dateTime(alert.created_at)}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
