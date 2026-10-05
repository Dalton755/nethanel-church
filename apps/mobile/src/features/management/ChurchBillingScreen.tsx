import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Phosphor from "phosphor-react-native";

import {
  useOrganization,
  type OrganizationPlanContext,
} from "../../contexts/OrganizationContext";
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

type BillingPlanContext = OrganizationPlanContext & {
  subscription_provider?: string | null;
  current_period_end?: string | null;
  can_cancel_subscription?: boolean;
};

type PlanItem = {
  code: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  currency: string;
  billing_interval: string | null;
  trial_days: number;
  recommended: boolean;
  limits: Record<string, number | null>;
  features: Record<string, boolean | string | number | null>;
};

function money(cents: number | null | undefined) {
  if (cents == null) return "Sob consulta";

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

function planHighlights(plan: PlanItem) {
  const people = plan.limits?.people;

  const common = [
    people ? `Até ${people.toLocaleString("pt-BR")} pessoas` : "Pessoas sem limite fixo",
    "Agenda, cultos, escalas, comunicação e Elo Kids",
  ];

  switch (plan.code) {
    case "ELO_ESSENCIAL":
      return [...common, "Financeiro e relatórios essenciais", "Logo da igreja no Elo"];
    case "ELO_CRESCIMENTO":
      return [...common, "Financeiro completo e exportação", "Cores da igreja e suporte prioritário"];
    case "ELO_COMPLETO":
      return [...common, "Relatórios avançados", "Splash e personalização ampliada"];
    case "ELO_WHITE_LABEL":
      return [...common, "Nome, ícone e abertura próprios", "APK exclusivo e identidade sem marca Elo"];
    case "ELO_REDE":
      return ["Múltiplas congregações", "Painel de rede", "White Label completo", "Suporte premium"];
    default:
      return common;
  }
}

export function ChurchBillingScreen({ onBack }: { onBack: () => void }) {
  const {
    activeOrganization,
    planContext,
    canAtOrganization,
    refreshContext,
  } = useOrganization();

  const billing = planContext as BillingPlanContext | null;
  const canManage =
    canAtOrganization("billing.manage") ||
    canAtOrganization("organization.manage");

  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutPlanCode, setCheckoutPlanCode] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("list_public_elo_plans");

    if (error) {
      setPlans([]);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setPlans(Array.isArray(data) ? (data as PlanItem[]) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  async function startCheckout(plan: PlanItem) {
    if (!activeOrganization) return;

    if (plan.code === "ELO_REDE") {
      Alert.alert(
        "Elo Rede",
        "Esse plano é configurado de acordo com a quantidade de congregações e a estrutura do ministério. A contratação é feita diretamente com a Nethanel."
      );
      return;
    }

    setCheckoutPlanCode(plan.code);

    try {
      const { data, error } = await supabase.functions.invoke(
        "elo-billing-checkout",
        {
          body: {
            organizationId: activeOrganization.id,
            planCode: plan.code,
          },
        }
      );

      if (error) throw error;

      if (data?.alreadyActive) {
        await refreshContext({ silent: true });
        Alert.alert("Plano já ativo", "Esta igreja já está usando esse plano.");
        return;
      }

      if (!data?.checkoutUrl) {
        throw new Error(data?.message ?? "O Mercado Pago não retornou o link de assinatura.");
      }

      await WebBrowser.openBrowserAsync(String(data.checkoutUrl));
      await refreshContext({ silent: true });

      Alert.alert(
        "Confirmação automática",
        "Se você concluiu a assinatura, o Elo será atualizado automaticamente assim que o Mercado Pago confirmar o pagamento."
      );
    } catch (error) {
      Alert.alert(
        "Não foi possível abrir a assinatura",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setCheckoutPlanCode(null);
    }
  }

  async function cancelSubscription() {
    if (!activeOrganization) return;

    setCanceling(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "elo-billing-cancel",
        {
          body: { organizationId: activeOrganization.id },
        }
      );

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "Não foi possível cancelar a assinatura.");

      await refreshContext({ silent: true });
      Alert.alert(
        "Assinatura cancelada",
        "A renovação automática foi cancelada. Os dados da igreja permanecem preservados."
      );
    } catch (error) {
      Alert.alert(
        "Não foi possível cancelar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setCanceling(false);
    }
  }

  function confirmCancellation() {
    Alert.alert(
      "Cancelar assinatura?",
      "A renovação automática será encerrada no Mercado Pago. Nenhum cadastro da igreja será apagado.",
      [
        { text: "Manter assinatura", style: "cancel" },
        {
          text: "Cancelar assinatura",
          style: "destructive",
          onPress: () => void cancelSubscription(),
        },
      ]
    );
  }

  if (!activeOrganization) {
    return (
      <EloScreen title="Plano e assinatura" onBack={onBack}>
        <EloState
          icon="ChurchIcon"
          title="Nenhuma igreja ativa"
          description="Selecione uma igreja para gerenciar o plano."
        />
      </EloScreen>
    );
  }

  if (!canManage) {
    return (
      <EloScreen title="Plano e assinatura" onBack={onBack}>
        <EloState
          icon="LockKeyIcon"
          title="Acesso restrito"
          description="Somente a administração da igreja pode contratar ou cancelar o plano do Elo."
        />
      </EloScreen>
    );
  }

  return (
    <EloScreen
      title="Plano e assinatura"
      eyebrow="ELO • CONTRATAÇÃO"
      subtitle="Acompanhe o teste, compare os planos e gerencie a assinatura da igreja."
      onBack={onBack}
    >
      <Text style={eloSharedStyles.sectionTitle}>Situação atual</Text>

      <EloCard style={billing?.is_blessed ? styles.blessedCard : undefined}>
        <View style={styles.currentHeader}>
          <View style={styles.currentIcon}>
            {billing?.is_blessed ? (
              <P.HandHeartIcon size={25} color="#9A6700" weight="duotone" />
            ) : billing?.is_trial ? (
              <P.TimerIcon size={25} color={eloColors.blue} weight="duotone" />
            ) : (
              <P.CreditCardIcon size={25} color={eloColors.green} weight="duotone" />
            )}
          </View>
          <View style={styles.currentCopy}>
            <Text style={styles.currentPlan}>{billing?.name ?? "Plano do Elo"}</Text>
            <Text style={styles.currentMeta}>
              {billing?.is_blessed
                ? "Cortesia integral concedida pela Nethanel"
                : billing?.is_trial
                  ? `Teste gratuito até ${dateLabel(billing.trial_ends_at)}`
                  : billing?.subscription_status === "active"
                    ? `${money(billing.price_cents)}/mês`
                    : "Escolha um plano para continuar com os recursos contratados."}
            </Text>
          </View>
        </View>

        {billing?.current_period_end && !billing.is_trial && !billing.is_blessed ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Próxima referência</Text>
            <Text style={styles.infoValue}>{dateLabel(billing.current_period_end)}</Text>
          </View>
        ) : null}

        {billing?.usage?.people != null ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pessoas cadastradas</Text>
            <Text style={styles.infoValue}>{billing.usage.people.toLocaleString("pt-BR")}</Text>
          </View>
        ) : null}

        {billing?.can_cancel_subscription ? (
          <View style={styles.cancelButton}>
            <EloActionButton
              label="Cancelar renovação"
              icon="XCircleIcon"
              variant="danger"
              loading={canceling}
              onPress={confirmCancellation}
            />
          </View>
        ) : null}
      </EloCard>

      {billing?.is_blessed ? (
        <View style={styles.blessingNotice}>
          <P.SealCheckIcon size={20} color="#8A5B00" weight="duotone" />
          <Text style={styles.blessingText}>
            Enquanto o Elo Abençoar estiver ativo, esta igreja não precisa contratar mensalidade e recebe os recursos integrais definidos pela Nethanel.
          </Text>
        </View>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>Planos do Elo</Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : errorMessage ? (
        <EloState icon="WarningCircleIcon" title="Não foi possível carregar os planos" description={errorMessage} />
      ) : (
        plans.map((plan) => {
          const billingIsActive =
            billing?.subscription_status === "active" &&
            billing?.subscription_provider === "mercado_pago";
          const current = billingIsActive && billing?.billing_plan_code === plan.code;
          const network = plan.code === "ELO_REDE";

          return (
            <EloCard
              key={plan.code}
              style={[
                styles.planCard,
                plan.recommended && styles.recommendedCard,
                current && styles.currentCard,
              ]}
            >
              <View style={styles.planHeader}>
                <View style={styles.planCopy}>
                  <View style={styles.planTitleRow}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    {plan.recommended ? (
                      <View style={styles.recommendedBadge}>
                        <Text style={styles.recommendedBadgeText}>MAIS ESCOLHIDO</Text>
                      </View>
                    ) : null}
                    {current ? (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>ATUAL</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.planDescription}>{plan.description}</Text>
                </View>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.price}>{money(plan.price_cents)}</Text>
                {plan.price_cents != null ? <Text style={styles.perMonth}>/mês</Text> : null}
              </View>

              <View style={styles.features}>
                {planHighlights(plan).map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <P.CheckCircleIcon size={17} color={eloColors.green} weight="fill" />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.planButton}>
                <EloActionButton
                  label={
                    current
                      ? "Plano atual"
                      : network
                        ? "Ver contratação consultiva"
                        : billing?.is_trial
                          ? `Assinar ${plan.name}`
                          : `Escolher ${plan.name}`
                  }
                  icon={current ? "CheckIcon" : network ? "BuildingsIcon" : "CreditCardIcon"}
                  variant={plan.recommended && !current ? "primary" : "secondary"}
                  disabled={current || Boolean(billing?.is_blessed)}
                  loading={checkoutPlanCode === plan.code}
                  onPress={() => void startCheckout(plan)}
                />
              </View>
            </EloCard>
          );
        })
      )}

      <View style={styles.securityNotice}>
        <P.ShieldCheckIcon size={19} color={eloColors.green} weight="duotone" />
        <Text style={styles.securityText}>
          A cobrança é processada pelo Mercado Pago. O Elo não recebe nem armazena os dados do cartão da igreja.
        </Text>
      </View>
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 160, alignItems: "center", justifyContent: "center" },
  currentHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  currentIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: eloColors.surfaceSoft,
  },
  currentCopy: { flex: 1 },
  currentPlan: { fontSize: 18, fontWeight: "900", color: eloColors.ink },
  currentMeta: { marginTop: 4, fontSize: 12, lineHeight: 18, color: eloColors.muted },
  infoRow: {
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: eloColors.line,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLabel: { fontSize: 11, fontWeight: "700", color: eloColors.muted },
  infoValue: { fontSize: 11, fontWeight: "900", color: eloColors.ink },
  cancelButton: { marginTop: 15 },
  blessedCard: { borderColor: "#E9CC76", backgroundColor: "#FFFDF5" },
  blessingNotice: {
    marginTop: 12,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 15,
    backgroundColor: "#FFF9E8",
  },
  blessingText: { flex: 1, fontSize: 11, lineHeight: 17, color: "#765B19" },
  planCard: { marginBottom: 12 },
  recommendedCard: { borderColor: "#9CCBE7", borderWidth: 2 },
  currentCard: { borderColor: "#A9D4B0", backgroundColor: "#FBFEFC" },
  planHeader: { flexDirection: "row", alignItems: "flex-start" },
  planCopy: { flex: 1 },
  planTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  planName: { fontSize: 17, fontWeight: "900", color: eloColors.ink },
  planDescription: { marginTop: 5, fontSize: 11, lineHeight: 17, color: eloColors.muted },
  recommendedBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#E9F5FC",
  },
  recommendedBadgeText: { fontSize: 8, fontWeight: "900", color: eloColors.blue },
  currentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: eloColors.successSoft,
  },
  currentBadgeText: { fontSize: 8, fontWeight: "900", color: eloColors.green },
  priceRow: { marginTop: 15, flexDirection: "row", alignItems: "baseline" },
  price: { fontSize: 24, fontWeight: "900", color: eloColors.ink },
  perMonth: { marginLeft: 4, fontSize: 11, fontWeight: "700", color: eloColors.muted },
  features: { marginTop: 13, gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  featureText: { flex: 1, fontSize: 11, lineHeight: 16, color: eloColors.ink },
  planButton: { marginTop: 16 },
  securityNotice: {
    marginTop: 8,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 15,
    backgroundColor: eloColors.successSoft,
  },
  securityText: { flex: 1, fontSize: 10, lineHeight: 16, color: "#456B4E" },
});