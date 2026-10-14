export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  repo_full_name: string | null;
  app_url: string | null;
  display_order: number;
};

export type Metric = {
  id: string;
  product_id: string;
  snapshot_at: string;
  users_total: number;
  customers_total: number;
  paying_customers: number;
  trials_active: number;
  subscriptions_active: number;
  revenue_month: number | string;
  revenue_total: number | string;
  mrr: number | string;
  churn_count: number;
  extra: Record<string, unknown>;
};

export type Plan = {
  id: string;
  product_id: string;
  source_plan_key: string | null;
  name: string;
  billing_type: string;
  price: number | string;
  currency: string;
  active: boolean;
  trial_enabled: boolean;
  trial_days: number;
  limits: Record<string, unknown>;
  external_provider_id: string | null;
  notes: string | null;
};

export type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  product_id: string | null;
  stage: string;
  source: string | null;
  potential_value: number | string;
  next_action_at: string | null;
  loss_reason: string | null;
  notes: string | null;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  customer_type: string;
  status: string;
  source: string | null;
  notes: string | null;
  created_at: string;
};

export type FinanceEntry = {
  id: string;
  product_id: string | null;
  entry_type: string;
  category: string;
  description: string | null;
  amount: number | string;
  status: string;
  occurred_at: string;
  payment_method: string | null;
  external_id: string | null;
};

export type Alert = {
  id: string;
  product_id: string | null;
  severity: string;
  title: string;
  message: string | null;
  status: string;
  action_url: string | null;
  created_at: string;
};

export type SyncStatus = {
  product_id: string;
  sync_mode: string;
  last_sync_at: string | null;
  last_status: string;
  details: string | null;
};

export type Tab =
  | "visao"
  | "produtos"
  | "clientes"
  | "comercial"
  | "financeiro"
  | "planos"
  | "alertas";

export const tabs: Array<{ id: Tab; label: string }> = [
  { id: "visao", label: "Visão geral" },
  { id: "produtos", label: "Produtos" },
  { id: "clientes", label: "Clientes" },
  { id: "comercial", label: "Comercial" },
  { id: "financeiro", label: "Financeiro" },
  { id: "planos", label: "Planos" },
  { id: "alertas", label: "Alertas" },
];

export const stageLabels: Record<string, string> = {
  LEAD: "Lead",
  INTERESSADO: "Interessado",
  TESTE: "Teste",
  NEGOCIACAO: "Negociação",
  CLIENTE: "Cliente",
  PERDIDO: "Perdido",
};

export function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

export function numberBr(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(Number(value ?? 0));
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
