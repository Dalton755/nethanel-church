import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Phosphor from "phosphor-react-native";

import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloCard,
  EloScreen,
  EloState,
  eloColors,
  eloSharedStyles,
} from "../elo/EloUi";

const P = Phosphor as any;

type DashboardSummary = {
  clients: number;
  paid_clients: number;
  free_clients: number;
  blessed_clients: number;
  people: number;
  contracted_mrr_cents: number;
  projected_arr_cents: number;
  collected_month_cents: number;
  collected_total_cents: number;
};

type ClientItem = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: string;
  created_at: string;
  plan_code: string;
  plan_name: string;
  subscription_status: string;
  current_period_end: string | null;
  people_count: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_blessed: boolean;
  blessing_reason: string | null;
  blessed_at: string | null;
};

type PaymentItem = {
  id: string;
  organization_id: string;
  organization_name: string;
  provider: string;
  status: string;
  amount_cents: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
};

type DashboardData = {
  summary: DashboardSummary;
  clients: ClientItem[];
  recent_payments: PaymentItem[];
};

type PlanFeatures = {
  church_logo?: boolean;
  custom_colors?: boolean;
  finance_level?: string;
  reports_level?: string;
  management_dashboard_level?: string;
  data_export?: boolean;
  custom_splash?: boolean;
  custom_app_name?: boolean;
  custom_launcher_icon?: boolean;
  standalone_apk?: boolean;
  custom_domain?: boolean | string;
  remove_elo_brand?: boolean;
  multi_unit?: boolean;
  network_dashboard?: boolean;
  support_level?: string;
};

type PlanItem = {
  code: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  currency: string;
  billing_interval: string | null;
  trial_days: number;
  grace_period_days: number;
  limits: {
    units?: number | null;
    people?: number | null;
  };
  features: PlanFeatures;
  recommended: boolean;
  sort_order: number;
};

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) {
    return "Sob consulta";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function peopleLimitLabel(plan: PlanItem) {
  const limit = plan.limits?.people;

  if (limit === null || limit === undefined) {
    return "Sem limite fixo";
  }

  return `Até ${limit.toLocaleString("pt-BR")} pessoas`;
}

function planHighlights(plan: PlanItem) {
  const highlights: string[] = [];

  if (plan.features.finance_level === "basic") {
    highlights.push("Financeiro básico");
  } else if (plan.features.finance_level === "full") {
    highlights.push("Financeiro completo");
  }

  if (plan.features.reports_level === "advanced") {
    highlights.push("Relatórios avançados");
  } else if (plan.features.reports_level === "standard") {
    highlights.push("Relatórios completos");
  }

  if (plan.features.data_export) {
    highlights.push("Exportação de dados");
  }

  if (plan.features.standalone_apk) {
    highlights.push("App próprio da igreja");
  }

  if (plan.features.multi_unit) {
    highlights.push("Matriz + congregações");
  }

  if (plan.features.custom_colors && highlights.length < 3) {
    highlights.push("Personalização visual");
  }

  return highlights.slice(0, 3);
}

export function PlatformAdminScreen({ onBack }: { onBack: () => void }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [blessingOrganizationId, setBlessingOrganizationId] = useState<string | null>(null);
  const [assigningPlanOrganizationId, setAssigningPlanOrganizationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const [dashboardResponse, plansResponse] = await Promise.all([
      supabase.rpc("platform_admin_dashboard"),
      supabase.rpc("platform_admin_plan_catalog"),
    ]);

    if (dashboardResponse.error || plansResponse.error) {
      setDashboard(null);
      setPlans([]);
      setErrorMessage(
        dashboardResponse.error?.message ??
          plansResponse.error?.message ??
          "Não foi possível carregar o painel."
      );
      setLoading(false);
      return;
    }

    setDashboard(dashboardResponse.data as DashboardData);
    setPlans((plansResponse.data ?? []) as PlanItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setChurchBlessing(client: ClientItem, active: boolean) {
    setBlessingOrganizationId(client.id);

    const { data, error } = await supabase.rpc("platform_admin_set_church_blessing", {
      p_organization_id: client.id,
      p_active: active,
      p_reason: active ? "Cortesia social — igreja abençoada pela Nethanel" : null,
    });

    setBlessingOrganizationId(null);

    if (error) {
      Alert.alert("Não foi possível atualizar", error.message);
      return;
    }

    setDashboard(data as DashboardData);

    Alert.alert(
      active ? "Igreja abençoada" : "Bênção encerrada",
      active
        ? `${client.name} agora tem acesso integral ao Nethanel Elo sem mensalidade.`
        : `${client.name} voltou a seguir as regras do plano comercial cadastrado.`
    );
  }

  function confirmChurchBlessing(client: ClientItem) {
    const nextActive = !client.is_blessed;

    Alert.alert(
      nextActive ? "Abençoar esta igreja?" : "Encerrar a bênção?",
      nextActive
        ? `A ${client.name} receberá acesso integral ao Elo sem cobrança de mensalidade.`
        : `A ${client.name} deixará de ter a cortesia social. Nenhum dado da igreja será apagado.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: nextActive ? "Abençoar" : "Encerrar bênção",
          style: nextActive ? "default" : "destructive",
          onPress: () => {
            void setChurchBlessing(client, nextActive);
          },
        },
      ]
    );
  }

  async function assignPlan(client: ClientItem, plan: PlanItem) {
    if (client.is_blessed) {
      Alert.alert(
        "Igreja abençoada",
        "Encerre a bênção antes de alterar o plano cobrado. O plano cadastrado pode ser alterado depois sem apagar nenhum dado."
      );
      return;
    }

    if (client.plan_code === plan.code) {
      return;
    }

    setAssigningPlanOrganizationId(client.id);

    const { data, error } = await supabase.rpc("platform_admin_assign_plan", {
      p_organization_id: client.id,
      p_plan_code: plan.code,
    });

    setAssigningPlanOrganizationId(null);

    if (error) {
      Alert.alert("Não foi possível alterar o plano", error.message);
      return;
    }

    setDashboard(data as DashboardData);
    Alert.alert("Plano atualizado", `${client.name} agora está no ${plan.name}.`);
  }

  function confirmAssignPlan(client: ClientItem, plan: PlanItem) {
    if (client.plan_code === plan.code) return;

    Alert.alert(
      `Mover para ${plan.name}?`,
      plan.price_cents === null
        ? `${client.name} ficará no ${plan.name}. O valor comercial deverá ser definido manualmente.`
        : `${client.name} ficará no ${plan.name} (${money(plan.price_cents)}/mês).`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Alterar plano",
          onPress: () => {
            void assignPlan(client, plan);
          },
        },
      ]
    );
  }

  const summary = dashboard?.summary;

  return (
    <EloScreen
      title="Painel Nethanel"
      eyebrow="PLATAFORMA • GESTÃO"
      subtitle="Clientes, receita, planos e cortesias sociais do Nethanel Elo."
      onBack={onBack}
      right={
        <Pressable onPress={() => void load()} style={styles.refreshButton}>
          <P.ArrowsClockwiseIcon size={20} color={eloColors.ink} weight="bold" />
        </Pressable>
      }
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      ) : errorMessage ? (
        <EloState icon="LockKeyIcon" title="Acesso não disponível" description={errorMessage} />
      ) : dashboard && summary ? (
        <>
          <Text style={eloSharedStyles.sectionTitle}>Visão geral</Text>
          <View style={styles.metricsGrid}>
            <MetricCard label="Clientes" value={String(summary.clients)} caption="igrejas ativas" />
            <MetricCard label="Assinaturas" value={String(summary.paid_clients)} caption="planos pagos" />
            <MetricCard
              label="Abençoadas"
              value={String(summary.blessed_clients)}
              caption="acesso integral gratuito"
              accent
            />
            <MetricCard label="Legado grátis" value={String(summary.free_clients)} caption="Elo Livre antigo" />
            <MetricCard label="Pessoas" value={String(summary.people)} caption="cadastradas" />
          </View>

          <Text style={eloSharedStyles.sectionTitle}>Financeiro da plataforma</Text>
          <View style={styles.metricsGrid}>
            <MetricCard
              label="MRR contratado"
              value={money(summary.contracted_mrr_cents)}
              caption="receita mensal recorrente"
            />
            <MetricCard
              label="ARR projetado"
              value={money(summary.projected_arr_cents)}
              caption="12 meses"
            />
            <MetricCard
              label="Recebido no mês"
              value={money(summary.collected_month_cents)}
              caption="pagamentos confirmados"
            />
            <MetricCard
              label="Recebido total"
              value={money(summary.collected_total_cents)}
              caption="histórico confirmado"
            />
          </View>

          <Text style={eloSharedStyles.sectionTitle}>Planos oficiais</Text>
          <Text style={styles.sectionIntro}>
            A grade abaixo vem do banco. Crescimento é o plano recomendado; Rede permanece sob consulta.
          </Text>

          {plans.map((plan) => (
            <PlanCard key={plan.code} plan={plan} />
          ))}

          <Text style={eloSharedStyles.sectionTitle}>Abençoar igrejas</Text>
          <EloCard style={styles.blessingInfoCard}>
            <View style={styles.blessingInfoRow}>
              <View style={styles.blessingIcon}>
                <P.HandHeartIcon size={24} color="#9A6700" weight="duotone" />
              </View>
              <View style={styles.blessingInfoCopy}>
                <Text style={styles.cardHeadline}>Cortesia social Nethanel</Text>
                <Text style={styles.cardCopy}>
                  Use “Abençoar” quando uma igreja não puder pagar. Ela recebe acesso integral ao Elo por R$ 0 enquanto a bênção estiver ativa.
                </Text>
              </View>
            </View>
          </EloCard>

          <Text style={eloSharedStyles.sectionTitle}>Clientes</Text>
          {dashboard.clients.length === 0 ? (
            <EloState
              icon="BuildingsIcon"
              title="Nenhum cliente ainda"
              description="As igrejas cadastradas no Elo aparecerão aqui."
            />
          ) : (
            dashboard.clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                plans={plans}
                blessingLoading={blessingOrganizationId === client.id}
                planLoading={assigningPlanOrganizationId === client.id}
                onToggleBlessing={() => confirmChurchBlessing(client)}
                onAssignPlan={(plan) => confirmAssignPlan(client, plan)}
              />
            ))
          )}

          <Text style={eloSharedStyles.sectionTitle}>Pagamentos recentes</Text>
          {dashboard.recent_payments.length === 0 ? (
            <EloCard>
              <Text style={styles.emptyTitle}>Nenhum pagamento confirmado ainda</Text>
              <Text style={styles.cardCopy}>Cobranças aprovadas aparecerão aqui automaticamente.</Text>
            </EloCard>
          ) : (
            dashboard.recent_payments.map((payment) => (
              <EloCard key={payment.id} style={styles.paymentCard}>
                <View style={styles.paymentRow}>
                  <View style={styles.paymentCopy}>
                    <Text style={styles.clientName}>{payment.organization_name}</Text>
                    <Text style={styles.clientMeta}>
                      {payment.provider} • {dateLabel(payment.paid_at ?? payment.created_at)}
                    </Text>
                  </View>
                  <Text style={styles.paymentAmount}>{money(payment.amount_cents)}</Text>
                </View>
              </EloCard>
            ))
          )}
        </>
      ) : null}
    </EloScreen>
  );
}

function MetricCard({
  label,
  value,
  caption,
  accent = false,
}: {
  label: string;
  value: string;
  caption: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.metricCard, accent && styles.metricCardAccent]}>
      <Text style={[styles.metricLabel, accent && styles.metricLabelAccent]}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricCaption}>{caption}</Text>
    </View>
  );
}

function PlanCard({ plan }: { plan: PlanItem }) {
  const highlights = planHighlights(plan);

  return (
    <EloCard style={[styles.planCard, plan.recommended && styles.planCardRecommended]}>
      <View style={styles.planHeader}>
        <View style={styles.planCopy}>
          <View style={styles.planTitleRow}>
            <Text style={styles.cardHeadline}>{plan.name}</Text>
            {plan.recommended ? (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedBadgeText}>MAIS ESCOLHIDO</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardCopy}>{plan.description ?? ""}</Text>
        </View>

        <View style={styles.planPriceWrap}>
          <Text style={styles.planPrice}>{money(plan.price_cents)}</Text>
          {plan.price_cents !== null ? <Text style={styles.planPerMonth}>/mês</Text> : null}
        </View>
      </View>

      <View style={styles.planDivider} />

      <View style={styles.planMetaRow}>
        <View style={styles.planMetaPill}>
          <P.UsersThreeIcon size={15} color={eloColors.blue} weight="duotone" />
          <Text style={styles.planMetaText}>{peopleLimitLabel(plan)}</Text>
        </View>
        {plan.trial_days > 0 ? (
          <View style={styles.planMetaPill}>
            <P.GiftIcon size={15} color={eloColors.green} weight="duotone" />
            <Text style={styles.planMetaText}>{plan.trial_days} dias grátis</Text>
          </View>
        ) : null}
      </View>

      {highlights.length > 0 ? (
        <View style={styles.planHighlights}>
          {highlights.map((highlight) => (
            <View key={highlight} style={styles.highlightRow}>
              <P.CheckCircleIcon size={16} color={eloColors.green} weight="fill" />
              <Text style={styles.highlightText}>{highlight}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </EloCard>
  );
}

function ClientCard({
  client,
  plans,
  blessingLoading,
  planLoading,
  onToggleBlessing,
  onAssignPlan,
}: {
  client: ClientItem;
  plans: PlanItem[];
  blessingLoading: boolean;
  planLoading: boolean;
  onToggleBlessing: () => void;
  onAssignPlan: (plan: PlanItem) => void;
}) {
  const location = [client.city, client.state].filter(Boolean).join(" • ") || "Local não informado";

  return (
    <EloCard style={[styles.clientCard, client.is_blessed && styles.clientCardBlessed]}>
      <View style={styles.clientHeader}>
        <View style={styles.clientCopy}>
          <View style={styles.clientTitleRow}>
            <Text style={styles.clientName}>{client.name}</Text>
            {client.is_blessed ? (
              <View style={styles.blessedBadge}>
                <P.HeartIcon size={12} color="#8A5B00" weight="fill" />
                <Text style={styles.blessedBadgeText}>ABENÇOADA</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.clientMeta}>
            {location} • {client.people_count} pessoas
          </Text>
        </View>

        <View
          style={[
            styles.planBadge,
            client.plan_code === "GRATUITO" && !client.is_blessed && styles.freeBadge,
            client.is_blessed && styles.blessedPlanBadge,
          ]}
        >
          <Text
            style={[
              styles.planBadgeText,
              client.plan_code === "GRATUITO" && !client.is_blessed && styles.freeBadgeText,
              client.is_blessed && styles.blessedPlanBadgeText,
            ]}
          >
            {client.is_blessed ? "Elo Abençoar" : client.plan_name}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />
      <InfoLine
        label="Status"
        value={client.is_blessed ? "Cortesia integral ativa" : client.subscription_status}
      />
      <InfoLine label="Cliente desde" value={dateLabel(client.created_at)} />
      {client.is_blessed ? (
        <InfoLine label="Abençoada em" value={dateLabel(client.blessed_at)} />
      ) : null}
      <InfoLine label="Contato" value={client.contact_name ?? "—"} />
      <InfoLine label="E-mail" value={client.contact_email ?? "—"} />
      <InfoLine label="Telefone" value={client.contact_phone ?? "—"} />

      <Text style={styles.planChooserTitle}>Plano comercial</Text>
      {planLoading ? (
        <View style={styles.planLoading}>
          <ActivityIndicator size="small" />
          <Text style={styles.planLoadingText}>Atualizando plano...</Text>
        </View>
      ) : (
        <View style={styles.planChooser}>
          {plans.map((plan) => {
            const selected = client.plan_code === plan.code && !client.is_blessed;

            return (
              <Pressable
                key={plan.code}
                disabled={client.is_blessed}
                onPress={() => onAssignPlan(plan)}
                style={({ pressed }) => [
                  styles.planChoice,
                  selected && styles.planChoiceSelected,
                  client.is_blessed && styles.planChoiceDisabled,
                  pressed && !client.is_blessed && !selected && styles.planChoicePressed,
                ]}
              >
                <Text
                  style={[
                    styles.planChoiceName,
                    selected && styles.planChoiceNameSelected,
                  ]}
                >
                  {plan.name.replace("Elo ", "")}
                </Text>
                <Text
                  style={[
                    styles.planChoicePrice,
                    selected && styles.planChoicePriceSelected,
                  ]}
                >
                  {money(plan.price_cents)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {client.is_blessed ? (
        <Text style={styles.blessedPlanHint}>
          A bênção está acima do plano comercial. Encerre a bênção para alterar a cobrança.
        </Text>
      ) : null}

      <View style={styles.blessingAction}>
        <EloActionButton
          label={client.is_blessed ? "Encerrar bênção" : "Abençoar igreja"}
          icon={client.is_blessed ? "XCircleIcon" : "HandHeartIcon"}
          variant={client.is_blessed ? "danger" : "secondary"}
          loading={blessingLoading}
          onPress={onToggleBlessing}
        />
      </View>
    </EloCard>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 360, alignItems: "center", justifyContent: "center" },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: eloColors.surface,
  },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: {
    width: "48%",
    minHeight: 112,
    padding: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: eloColors.surface,
  },
  metricCardAccent: { backgroundColor: "#FFF9E8", borderColor: "#F0D992" },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: eloColors.muted,
  },
  metricLabelAccent: { color: "#8A5B00" },
  metricValue: {
    marginTop: 9,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
    color: eloColors.ink,
  },
  metricCaption: { marginTop: 4, fontSize: 10, lineHeight: 14, color: eloColors.muted },
  sectionIntro: {
    marginTop: -3,
    marginBottom: 10,
    fontSize: 11,
    lineHeight: 17,
    color: eloColors.muted,
  },
  cardHeadline: { fontSize: 18, fontWeight: "900", color: eloColors.ink },
  cardCopy: { marginTop: 5, fontSize: 12, lineHeight: 18, color: eloColors.muted },
  planCard: { marginBottom: 10 },
  planCardRecommended: { borderColor: "#B8D6EA", backgroundColor: "#F8FCFF" },
  planHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  planCopy: { flex: 1 },
  planTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  recommendedBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#E5F3FC",
  },
  recommendedBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
    color: eloColors.blue,
  },
  planPriceWrap: { alignItems: "flex-end" },
  planPrice: { fontSize: 16, fontWeight: "900", color: eloColors.ink },
  planPerMonth: { marginTop: 1, fontSize: 9, fontWeight: "700", color: eloColors.muted },
  planDivider: { height: 1, marginVertical: 12, backgroundColor: eloColors.line },
  planMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  planMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: eloColors.surfaceSoft,
  },
  planMetaText: { fontSize: 9, fontWeight: "800", color: eloColors.ink },
  planHighlights: { marginTop: 11, gap: 7 },
  highlightRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  highlightText: { flex: 1, fontSize: 10, lineHeight: 14, color: eloColors.muted },
  blessingInfoCard: { backgroundColor: "#FFF9E8", borderColor: "#F0D992" },
  blessingInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  blessingIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1C7",
  },
  blessingInfoCopy: { flex: 1 },
  clientCard: { marginBottom: 10 },
  clientCardBlessed: { borderColor: "#E9CC76", backgroundColor: "#FFFDF5" },
  clientHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  clientCopy: { flex: 1 },
  clientTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  clientName: { fontSize: 15, fontWeight: "900", color: eloColors.ink },
  clientMeta: { marginTop: 3, fontSize: 10, color: eloColors.muted },
  blessedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FFF0BD",
  },
  blessedBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: "#8A5B00",
  },
  planBadge: {
    maxWidth: 122,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: eloColors.successSoft,
  },
  planBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
    color: eloColors.green,
  },
  freeBadge: { backgroundColor: eloColors.surfaceSoft },
  freeBadgeText: { color: eloColors.blue },
  blessedPlanBadge: { backgroundColor: "#FFF0BD" },
  blessedPlanBadgeText: { color: "#8A5B00" },
  divider: { height: 1, marginVertical: 12, backgroundColor: eloColors.line },
  infoLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 4,
  },
  infoLabel: { width: 88, fontSize: 10, fontWeight: "800", color: eloColors.muted },
  infoValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "700",
    color: eloColors.ink,
  },
  planChooserTitle: {
    marginTop: 15,
    marginBottom: 8,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: eloColors.muted,
  },
  planChooser: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  planChoice: {
    minWidth: "30%",
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 12,
    backgroundColor: eloColors.surface,
  },
  planChoiceSelected: {
    borderColor: eloColors.blue,
    backgroundColor: "#EAF6FD",
  },
  planChoiceDisabled: { opacity: 0.45 },
  planChoicePressed: { opacity: 0.7 },
  planChoiceName: { fontSize: 9, fontWeight: "900", color: eloColors.ink },
  planChoiceNameSelected: { color: eloColors.blue },
  planChoicePrice: { marginTop: 2, fontSize: 8, fontWeight: "700", color: eloColors.muted },
  planChoicePriceSelected: { color: eloColors.blue },
  planLoading: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  planLoadingText: { fontSize: 10, fontWeight: "700", color: eloColors.muted },
  blessedPlanHint: { marginTop: 8, fontSize: 9, lineHeight: 14, color: "#8A5B00" },
  blessingAction: { marginTop: 14 },
  emptyTitle: { fontSize: 14, fontWeight: "900", color: eloColors.ink },
  paymentCard: { marginBottom: 10 },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  paymentCopy: { flex: 1 },
  paymentAmount: { fontSize: 15, fontWeight: "900", color: eloColors.green },
});
