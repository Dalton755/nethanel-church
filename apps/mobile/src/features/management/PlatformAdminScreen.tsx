import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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

type PaidPlan = {
  code: string;
  name: string;
  price_cents: number | null;
  currency: string;
  billing_interval: string | null;
  trial_days: number;
  grace_period_days: number;
};

type FreeLimits = {
  units?: number;
  people?: number;
  management_users?: number;
  departments?: number;
  active_service_series?: number;
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
  paid_plan: PaidPlan | null;
  free_plan: {
    code: string;
    name: string;
    limits: FreeLimits;
  } | null;
  clients: ClientItem[];
  recent_payments: PaymentItem[];
};

type FormState = {
  price: string;
  trialDays: string;
  graceDays: string;
  units: string;
  people: string;
  managementUsers: string;
  departments: string;
  activeSeries: string;
};

const EMPTY_FORM: FormState = {
  price: "",
  trialDays: "",
  graceDays: "",
  units: "",
  people: "",
  managementUsers: "",
  departments: "",
  activeSeries: "",
};

function money(cents: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents ?? 0) / 100);
}

function editableMoney(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toFixed(2).replace(".", ",");
}

function parseMoneyToCents(value: string) {
  const cleaned = value.trim().replace(/[^0-9,.]/g, "");

  if (!cleaned) return Number.NaN;

  let normalized = cleaned;

  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if ((cleaned.match(/\./g)?.length ?? 0) > 1) {
    normalized = cleaned.replace(/\./g, "");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}

function parseWholeNumber(value: string) {
  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function PlatformAdminScreen({ onBack }: { onBack: () => void }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blessingOrganizationId, setBlessingOrganizationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const applyDashboard = useCallback((data: DashboardData) => {
    setDashboard(data);

    const paid = data.paid_plan;
    const limits = data.free_plan?.limits ?? {};

    setForm({
      price: editableMoney(paid?.price_cents),
      trialDays: String(paid?.trial_days ?? 14),
      graceDays: String(paid?.grace_period_days ?? 3),
      units: String(limits.units ?? 1),
      people: String(limits.people ?? 50),
      managementUsers: String(limits.management_users ?? 2),
      departments: String(limits.departments ?? 2),
      activeSeries: String(limits.active_service_series ?? 4),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("platform_admin_dashboard");

    if (error) {
      setDashboard(null);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    applyDashboard(data as DashboardData);
    setLoading(false);
  }, [applyDashboard]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateForm(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveBilling() {
    const values = {
      priceCents: parseMoneyToCents(form.price),
      trialDays: parseWholeNumber(form.trialDays),
      graceDays: parseWholeNumber(form.graceDays),
      units: parseWholeNumber(form.units),
      people: parseWholeNumber(form.people),
      managementUsers: parseWholeNumber(form.managementUsers),
      departments: parseWholeNumber(form.departments),
      activeSeries: parseWholeNumber(form.activeSeries),
    };

    if (Object.values(values).some((value) => !Number.isFinite(value))) {
      Alert.alert("Revise os campos", "Preencha todos os valores com números válidos.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase.rpc("platform_admin_update_billing", {
      p_price_cents: values.priceCents,
      p_trial_days: values.trialDays,
      p_grace_period_days: values.graceDays,
      p_free_units_limit: values.units,
      p_free_people_limit: values.people,
      p_free_management_users_limit: values.managementUsers,
      p_free_departments_limit: values.departments,
      p_free_active_series_limit: values.activeSeries,
    });

    setSaving(false);

    if (error) {
      Alert.alert("Não foi possível salvar", error.message);
      return;
    }

    applyDashboard(data as DashboardData);
    Alert.alert("Configuração atualizada", "Preço, teste e limites do Elo Livre foram atualizados.");
  }

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

    applyDashboard(data as DashboardData);

    Alert.alert(
      active ? "Igreja abençoada" : "Bênção encerrada",
      active
        ? `${client.name} agora tem todos os recursos do Elo Igreja gratuitamente, sem mensalidade.`
        : `${client.name} voltou a seguir as regras do plano e da assinatura cadastrada.`
    );
  }

  function confirmChurchBlessing(client: ClientItem) {
    const nextActive = !client.is_blessed;

    Alert.alert(
      nextActive ? "Abençoar esta igreja?" : "Encerrar a bênção?",
      nextActive
        ? `A ${client.name} receberá acesso completo ao Elo Igreja sem cobrança de mensalidade.`
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
            <MetricCard label="Elo Igreja" value={String(summary.paid_clients)} caption="assinaturas pagas" />
            <MetricCard label="Abençoadas" value={String(summary.blessed_clients)} caption="acesso integral gratuito" accent />
            <MetricCard label="Elo Livre" value={String(summary.free_clients)} caption="plano gratuito" />
            <MetricCard label="Pessoas" value={String(summary.people)} caption="cadastradas" />
          </View>

          <Text style={eloSharedStyles.sectionTitle}>Financeiro da plataforma</Text>
          <View style={styles.metricsGrid}>
            <MetricCard label="MRR contratado" value={money(summary.contracted_mrr_cents)} caption="receita mensal recorrente" />
            <MetricCard label="ARR projetado" value={money(summary.projected_arr_cents)} caption="12 meses" />
            <MetricCard label="Recebido no mês" value={money(summary.collected_month_cents)} caption="pagamentos confirmados" />
            <MetricCard label="Recebido total" value={money(summary.collected_total_cents)} caption="histórico confirmado" />
          </View>

          <Text style={eloSharedStyles.sectionTitle}>Planos e cobrança</Text>
          <EloCard>
            <Text style={styles.cardHeadline}>Elo Igreja</Text>
            <Text style={styles.cardCopy}>
              Estes valores ficam no banco e podem ser alterados sem publicar uma nova versão do aplicativo.
            </Text>

            <Field label="Mensalidade" value={form.price} prefix="R$" keyboardType="decimal-pad" onChangeText={(value) => updateForm("price", value)} />

            <View style={styles.inlineFields}>
              <View style={styles.inlineField}>
                <Field label="Teste gratuito" value={form.trialDays} suffix="dias" keyboardType="number-pad" onChangeText={(value) => updateForm("trialDays", value)} />
              </View>
              <View style={styles.inlineField}>
                <Field label="Tolerância" value={form.graceDays} suffix="dias" keyboardType="number-pad" onChangeText={(value) => updateForm("graceDays", value)} />
              </View>
            </View>

            <View style={styles.planPreview}>
              <Text style={styles.planPreviewLabel}>VALOR ATUAL</Text>
              <Text style={styles.planPreviewValue}>{money(dashboard.paid_plan?.price_cents)}</Text>
              <Text style={styles.planPreviewHint}>
                {dashboard.paid_plan?.trial_days ?? 0} dias grátis • cobrança mensal
              </Text>
            </View>
          </EloCard>

          <Text style={styles.freeTitle}>Limites do Elo Livre</Text>
          <EloCard>
            <View style={styles.inlineFields}>
              <View style={styles.inlineField}>
                <Field label="Igrejas/unidades" value={form.units} keyboardType="number-pad" onChangeText={(value) => updateForm("units", value)} />
              </View>
              <View style={styles.inlineField}>
                <Field label="Pessoas" value={form.people} keyboardType="number-pad" onChangeText={(value) => updateForm("people", value)} />
              </View>
            </View>
            <View style={styles.inlineFields}>
              <View style={styles.inlineField}>
                <Field label="Usuários de gestão" value={form.managementUsers} keyboardType="number-pad" onChangeText={(value) => updateForm("managementUsers", value)} />
              </View>
              <View style={styles.inlineField}>
                <Field label="Departamentos" value={form.departments} keyboardType="number-pad" onChangeText={(value) => updateForm("departments", value)} />
              </View>
            </View>
            <Field label="Séries/cultos recorrentes ativos" value={form.activeSeries} keyboardType="number-pad" onChangeText={(value) => updateForm("activeSeries", value)} />
            <Text style={styles.auditNote}>Toda alteração fica registrada no histórico administrativo da plataforma.</Text>
            <View style={styles.saveButton}>
              <EloActionButton label="Salvar configuração" icon="FloppyDiskIcon" loading={saving} onPress={() => void saveBilling()} />
            </View>
          </EloCard>

          <Text style={eloSharedStyles.sectionTitle}>Abençoar igrejas</Text>
          <EloCard style={styles.blessingInfoCard}>
            <View style={styles.blessingInfoRow}>
              <View style={styles.blessingIcon}>
                <P.HandHeartIcon size={24} color="#9A6700" weight="duotone" />
              </View>
              <View style={styles.blessingInfoCopy}>
                <Text style={styles.cardHeadline}>Cortesia social Nethanel</Text>
                <Text style={styles.cardCopy}>
                  Use “Abençoar” para uma igreja que não pode pagar. Ela recebe todos os recursos do Elo Igreja, sem mensalidade, enquanto a bênção estiver ativa.
                </Text>
              </View>
            </View>
          </EloCard>

          <Text style={eloSharedStyles.sectionTitle}>Clientes</Text>
          {dashboard.clients.length === 0 ? (
            <EloState icon="BuildingsIcon" title="Nenhum cliente ainda" description="As igrejas cadastradas no Elo aparecerão aqui." />
          ) : (
            dashboard.clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                blessingLoading={blessingOrganizationId === client.id}
                onToggleBlessing={() => confirmChurchBlessing(client)}
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
                    <Text style={styles.clientMeta}>{payment.provider} • {dateLabel(payment.paid_at ?? payment.created_at)}</Text>
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

function MetricCard({ label, value, caption, accent = false }: { label: string; value: string; caption: string; accent?: boolean }) {
  return (
    <View style={[styles.metricCard, accent && styles.metricCardAccent]}>
      <Text style={[styles.metricLabel, accent && styles.metricLabelAccent]}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricCaption}>{caption}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType: "decimal-pad" | "number-pad";
  prefix?: string;
  suffix?: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {prefix ? <Text style={styles.inputAffix}>{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          style={styles.input}
          selectTextOnFocus
        />
        {suffix ? <Text style={styles.inputAffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function ClientCard({
  client,
  blessingLoading,
  onToggleBlessing,
}: {
  client: ClientItem;
  blessingLoading: boolean;
  onToggleBlessing: () => void;
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
          <Text style={styles.clientMeta}>{location} • {client.people_count} pessoas</Text>
        </View>

        <View style={[styles.planBadge, client.plan_code === "GRATUITO" && !client.is_blessed && styles.freeBadge, client.is_blessed && styles.blessedPlanBadge]}>
          <Text style={[styles.planBadgeText, client.plan_code === "GRATUITO" && !client.is_blessed && styles.freeBadgeText, client.is_blessed && styles.blessedPlanBadgeText]}>
            {client.is_blessed ? "Elo completo" : client.plan_name}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />
      <InfoLine label="Status" value={client.is_blessed ? "Cortesia integral ativa" : client.subscription_status} />
      <InfoLine label="Cliente desde" value={dateLabel(client.created_at)} />
      {client.is_blessed ? <InfoLine label="Abençoada em" value={dateLabel(client.blessed_at)} /> : null}
      <InfoLine label="Contato" value={client.contact_name ?? "—"} />
      <InfoLine label="E-mail" value={client.contact_email ?? "—"} />
      <InfoLine label="Telefone" value={client.contact_phone ?? "—"} />

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
      <Text selectable style={styles.infoValue}>{value}</Text>
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
  metricLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", color: eloColors.muted },
  metricLabelAccent: { color: "#8A5B00" },
  metricValue: { marginTop: 9, fontSize: 24, lineHeight: 29, fontWeight: "900", color: eloColors.ink },
  metricCaption: { marginTop: 4, fontSize: 10, lineHeight: 14, color: eloColors.muted },
  cardHeadline: { fontSize: 18, fontWeight: "900", color: eloColors.ink },
  cardCopy: { marginTop: 5, fontSize: 12, lineHeight: 18, color: eloColors.muted },
  fieldBlock: { flex: 1, marginTop: 15 },
  fieldLabel: { marginBottom: 7, fontSize: 11, fontWeight: "800", color: eloColors.muted },
  inputWrap: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: "#FAFBFC",
  },
  input: { flex: 1, minWidth: 40, paddingVertical: 11, fontSize: 16, fontWeight: "800", color: eloColors.ink },
  inputAffix: { marginRight: 7, fontSize: 12, fontWeight: "800", color: eloColors.muted },
  inlineFields: { flexDirection: "row", gap: 10 },
  inlineField: { flex: 1 },
  planPreview: { marginTop: 16, padding: 14, borderRadius: 15, backgroundColor: eloColors.surfaceSoft },
  planPreviewLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8, color: eloColors.muted },
  planPreviewValue: { marginTop: 4, fontSize: 25, fontWeight: "900", color: eloColors.ink },
  planPreviewHint: { marginTop: 2, fontSize: 11, color: eloColors.muted },
  freeTitle: { marginTop: 14, marginBottom: 8, fontSize: 13, fontWeight: "900", color: eloColors.ink },
  auditNote: { marginTop: 15, fontSize: 10, lineHeight: 15, color: eloColors.muted },
  saveButton: { marginTop: 15 },
  blessingInfoCard: { backgroundColor: "#FFF9E8", borderColor: "#F0D992" },
  blessingInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  blessingIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1C7" },
  blessingInfoCopy: { flex: 1 },
  clientCard: { marginBottom: 10 },
  clientCardBlessed: { borderColor: "#E9CC76", backgroundColor: "#FFFDF5" },
  clientHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  clientCopy: { flex: 1 },
  clientTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  clientName: { fontSize: 15, fontWeight: "900", color: eloColors.ink },
  clientMeta: { marginTop: 3, fontSize: 10, color: eloColors.muted },
  blessedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FFF0BD" },
  blessedBadgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.5, color: "#8A5B00" },
  planBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: eloColors.successSoft },
  planBadgeText: { fontSize: 9, fontWeight: "900", color: eloColors.green },
  freeBadge: { backgroundColor: eloColors.surfaceSoft },
  freeBadgeText: { color: eloColors.blue },
  blessedPlanBadge: { backgroundColor: "#FFF0BD" },
  blessedPlanBadgeText: { color: "#8A5B00" },
  divider: { height: 1, marginVertical: 12, backgroundColor: eloColors.line },
  infoLine: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 4 },
  infoLabel: { width: 88, fontSize: 10, fontWeight: "800", color: eloColors.muted },
  infoValue: { flex: 1, textAlign: "right", fontSize: 11, fontWeight: "700", color: eloColors.ink },
  blessingAction: { marginTop: 14 },
  emptyTitle: { fontSize: 14, fontWeight: "900", color: eloColors.ink },
  paymentCard: { marginBottom: 10 },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  paymentCopy: { flex: 1 },
  paymentAmount: { fontSize: 15, fontWeight: "900", color: eloColors.green },
});
