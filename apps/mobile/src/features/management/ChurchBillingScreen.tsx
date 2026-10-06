import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import * as Phosphor from "phosphor-react-native";
import QRCode from "react-native-qrcode-svg";

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
  renewal_canceled?: boolean;
  is_grace_period?: boolean;
  access_ends_at?: string | null;
  billing_recurring_provider?: string | null;
  billing_recurring_method?: string | null;
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

type PayerProfile = {
  name?: string | null;
  cpf_cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
};

type PaymentContext = {
  payer?: PayerProfile | null;
  recurring?: {
    provider?: string | null;
    authorization_type?: string | null;
    status?: string | null;
    plan_code?: string | null;
  } | null;
};

type BillingCapabilities = {
  asaasConfigured: boolean;
  mercadoPagoAvailable: boolean;
};

type PaymentMethod = "pix_automatic" | "pix" | "boleto" | "card";

type PaymentResult = {
  paymentMethod: PaymentMethod;
  pixPayload?: string | null;
  pixExpiration?: string | null;
  checkoutUrl?: string | null;
  boletoUrl?: string | null;
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

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function documentMask(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function phoneMask(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
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
  const [paymentContext, setPaymentContext] = useState<PaymentContext | null>(null);
  const [capabilities, setCapabilities] = useState<BillingCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [savingPayer, setSavingPayer] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);

  const [payerName, setPayerName] = useState("");
  const [payerDocument, setPayerDocument] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === selectedPlanCode) ?? null,
    [plans, selectedPlanCode]
  );

  const hydratePayer = useCallback((payer?: PayerProfile | null) => {
    setPayerName(payer?.name ?? "");
    setPayerDocument(documentMask(payer?.cpf_cnpj ?? ""));
    setPayerEmail(payer?.email ?? "");
    setPayerPhone(phoneMask(payer?.phone ?? ""));
  }, []);

  const loadBilling = useCallback(async () => {
    if (!activeOrganization) return;

    setLoading(true);
    setErrorMessage(null);

    const [plansResult, contextResult, capabilitiesResult] = await Promise.all([
      supabase.rpc("list_public_elo_plans"),
      supabase.rpc("billing_get_payment_context", {
        p_organization_id: activeOrganization.id,
      }),
      supabase.functions.invoke("elo-billing-payment", {
        body: { action: "capabilities" },
      }),
    ]);

    if (plansResult.error) {
      setPlans([]);
      setErrorMessage(plansResult.error.message);
    } else {
      setPlans(Array.isArray(plansResult.data) ? (plansResult.data as PlanItem[]) : []);
    }

    if (!contextResult.error) {
      const nextContext = (contextResult.data ?? null) as PaymentContext | null;
      setPaymentContext(nextContext);
      hydratePayer(nextContext?.payer);
    }

    if (!capabilitiesResult.error && capabilitiesResult.data?.ok) {
      setCapabilities({
        asaasConfigured: Boolean(capabilitiesResult.data.asaasConfigured),
        mercadoPagoAvailable: Boolean(capabilitiesResult.data.mercadoPagoAvailable),
      });
    }

    setLoading(false);
  }, [activeOrganization, hydratePayer]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  async function savePayerProfile(silent = false) {
    if (!activeOrganization) return false;

    const document = onlyDigits(payerDocument);
    if (!payerName.trim()) {
      Alert.alert("Dados de cobrança", "Informe o nome ou razão social do pagador.");
      return false;
    }
    if (![11, 14].includes(document.length)) {
      Alert.alert("Dados de cobrança", "Informe um CPF ou CNPJ válido.");
      return false;
    }

    setSavingPayer(true);
    try {
      const { data, error } = await supabase.rpc("billing_save_payer_profile", {
        p_organization_id: activeOrganization.id,
        p_name: payerName.trim(),
        p_cpf_cnpj: document,
        p_email: payerEmail.trim() || null,
        p_phone: onlyDigits(payerPhone) || null,
      });

      if (error) throw error;

      setPaymentContext((current) => ({
        ...(current ?? {}),
        payer: (data ?? null) as PayerProfile | null,
      }));

      if (!silent) {
        Alert.alert(
          "Dados salvos",
          "Esses dados serão usados somente para cobrança e podem ser diferentes do login do Elo."
        );
      }
      return true;
    } catch (error) {
      Alert.alert(
        "Não foi possível salvar",
        error instanceof Error ? error.message : "Tente novamente."
      );
      return false;
    } finally {
      setSavingPayer(false);
    }
  }

  async function startAsaasPayment(plan: PlanItem, method: PaymentMethod) {
    if (!activeOrganization) return;

    if (!capabilities?.asaasConfigured) {
      Alert.alert(
        "Novas formas de pagamento",
        "Pix, Pix Automático, boleto e cartão já estão implementados no Elo. Falta apenas ativar a conta do provedor de cobrança na Nethanel. Enquanto isso, o Mercado Pago continua disponível."
      );
      return;
    }

    const payerReady = await savePayerProfile(true);
    if (!payerReady) return;

    const loadingKey = `${plan.code}:${method}`;
    setPaymentLoading(loadingKey);
    setPaymentResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("elo-billing-payment", {
        body: {
          organizationId: activeOrganization.id,
          planCode: plan.code,
          paymentMethod: method,
        },
      });

      if (error) {
        throw new Error(data?.message ?? error.message);
      }
      if (!data?.ok) {
        throw new Error(data?.message ?? "Não foi possível gerar a cobrança.");
      }

      const result: PaymentResult = {
        paymentMethod: method,
        pixPayload: data.pixPayload ?? null,
        pixExpiration: data.pixExpiration ?? null,
        checkoutUrl: data.checkoutUrl ?? null,
        boletoUrl: data.boletoUrl ?? null,
      };

      if (method === "pix" || method === "pix_automatic") {
        if (!result.pixPayload) {
          throw new Error("A cobrança foi criada, mas o código Pix não foi retornado. Tente novamente.");
        }
        setPaymentResult(result);
      } else {
        const url = result.boletoUrl || result.checkoutUrl;
        if (!url) throw new Error("O provedor não retornou o link de pagamento.");
        await WebBrowser.openBrowserAsync(String(url));
        await refreshContext({ silent: true });
        Alert.alert(
          "Cobrança gerada",
          "Assim que o pagamento for confirmado, o Nethanel Elo libera ou renova o plano automaticamente."
        );
      }
    } catch (error) {
      Alert.alert(
        "Não foi possível gerar a cobrança",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setPaymentLoading(null);
    }
  }

  async function startMercadoPago(plan: PlanItem) {
    if (!activeOrganization) return;

    const loadingKey = `${plan.code}:mercado_pago`;
    setPaymentLoading(loadingKey);

    try {
      const { data, error } = await supabase.functions.invoke("elo-billing-checkout", {
        body: {
          organizationId: activeOrganization.id,
          planCode: plan.code,
          payerEmail: payerEmail.trim() || undefined,
        },
      });

      if (error) throw new Error(data?.message ?? error.message);

      if (data?.alreadyActive) {
        await refreshContext({ silent: true });
        Alert.alert("Plano já ativo", "Esta igreja já está usando esse plano com renovação automática.");
        return;
      }

      if (!data?.checkoutUrl) {
        throw new Error(data?.message ?? "O Mercado Pago não retornou o link da assinatura.");
      }

      await WebBrowser.openBrowserAsync(String(data.checkoutUrl));
      await refreshContext({ silent: true });

      Alert.alert(
        "Confirmação automática",
        "Se você concluiu o pagamento, o Elo será atualizado automaticamente após a confirmação."
      );
    } catch (error) {
      Alert.alert(
        "Não foi possível abrir o Mercado Pago",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setPaymentLoading(null);
    }
  }

  async function cancelSubscription() {
    if (!activeOrganization) return;

    setCanceling(true);
    try {
      const { data, error } = await supabase.functions.invoke("elo-billing-cancel", {
        body: { organizationId: activeOrganization.id },
      });

      if (error) throw new Error(data?.message ?? error.message);
      if (!data?.ok) throw new Error(data?.message ?? "Não foi possível cancelar a renovação.");

      await refreshContext({ silent: true });
      await loadBilling();
      Alert.alert(
        "Renovação cancelada",
        "A cobrança automática foi encerrada. O acesso permanece até o fim do período já pago e nenhum dado da igreja será apagado."
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
      "Cancelar renovação?",
      "A cobrança automática será interrompida. O acesso permanece até o fim do período já pago.",
      [
        { text: "Manter renovação", style: "cancel" },
        {
          text: "Cancelar renovação",
          style: "destructive",
          onPress: () => void cancelSubscription(),
        },
      ]
    );
  }

  if (!activeOrganization) {
    return (
      <EloScreen title="Plano e assinatura" onBack={onBack}>
        <EloState icon="ChurchIcon" title="Nenhuma igreja ativa" description="Selecione uma igreja para gerenciar o plano." />
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

  const currentMeta = billing?.is_blessed
    ? "Cortesia integral concedida pela Nethanel"
    : billing?.is_trial
      ? `Teste gratuito até ${dateLabel(billing.trial_ends_at)}`
      : billing?.renewal_canceled
        ? `Renovação cancelada • acesso até ${dateLabel(billing.access_ends_at)}`
        : billing?.is_grace_period
          ? `Pagamento pendente • tolerância até ${dateLabel(billing.access_ends_at)}`
          : billing?.subscription_status === "active"
            ? `${money(billing.price_cents)}/mês • acesso até ${dateLabel(billing.current_period_end)}`
            : "Escolha um plano para continuar com os recursos contratados.";

  return (
    <EloScreen
      title="Plano e assinatura"
      eyebrow="ELO • NETHANEL BILLING"
      subtitle="A mensalidade é controlada pelo Elo. Você escolhe como deseja pagar."
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
            ) : billing?.is_grace_period ? (
              <P.WarningCircleIcon size={25} color={eloColors.yellow} weight="duotone" />
            ) : (
              <P.CreditCardIcon size={25} color={eloColors.green} weight="duotone" />
            )}
          </View>
          <View style={styles.currentCopy}>
            <Text style={styles.currentPlan}>{billing?.name ?? "Plano do Elo"}</Text>
            <Text style={styles.currentMeta}>{currentMeta}</Text>
          </View>
        </View>

        {billing?.usage?.people != null ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pessoas cadastradas</Text>
            <Text style={styles.infoValue}>{billing.usage.people.toLocaleString("pt-BR")}</Text>
          </View>
        ) : null}

        {billing?.can_cancel_subscription ? (
          <View style={styles.cancelButton}>
            <EloActionButton
              label="Cancelar renovação automática"
              icon="XCircleIcon"
              variant="danger"
              loading={canceling}
              onPress={confirmCancellation}
            />
          </View>
        ) : null}
      </EloCard>

      {billing?.is_grace_period ? (
        <View style={styles.notice}>
          <P.WarningCircleIcon size={20} color="#8A5B00" weight="duotone" />
          <Text style={styles.noticeText}>
            O vencimento passou, mas o Elo mantém o acesso durante a tolerância. Um novo pagamento renova o acesso automaticamente.
          </Text>
        </View>
      ) : null}

      {!billing?.is_blessed ? (
        <>
          <Text style={eloSharedStyles.sectionTitle}>Dados de cobrança</Text>
          <EloCard>
            <Text style={styles.helperText}>
              Estes dados pertencem ao pagador e podem ser totalmente diferentes do e-mail usado para entrar no Elo.
            </Text>

            <Text style={styles.label}>Nome / razão social</Text>
            <TextInput
              value={payerName}
              onChangeText={setPayerName}
              placeholder="Igreja, tesoureiro ou responsável"
              style={styles.input}
              returnKeyType="next"
            />

            <Text style={styles.label}>CPF ou CNPJ</Text>
            <TextInput
              value={payerDocument}
              onChangeText={(value) => setPayerDocument(documentMask(value))}
              placeholder="00.000.000/0000-00"
              keyboardType="number-pad"
              style={styles.input}
            />

            <Text style={styles.label}>E-mail de cobrança</Text>
            <TextInput
              value={payerEmail}
              onChangeText={setPayerEmail}
              placeholder="financeiro@igreja.com.br"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
            <Text style={styles.fieldHint}>Não precisa ser o mesmo e-mail do login do Elo.</Text>

            <Text style={styles.label}>Telefone</Text>
            <TextInput
              value={payerPhone}
              onChangeText={(value) => setPayerPhone(phoneMask(value))}
              placeholder="(11) 99999-9999"
              keyboardType="phone-pad"
              style={styles.input}
            />

            <View style={styles.buttonGap}>
              <EloActionButton
                label="Salvar dados de cobrança"
                icon="FloppyDiskIcon"
                variant="secondary"
                loading={savingPayer}
                onPress={() => void savePayerProfile(false)}
              />
            </View>
          </EloCard>
        </>
      ) : null}

      {paymentResult?.pixPayload ? (
        <>
          <Text style={eloSharedStyles.sectionTitle}>
            {paymentResult.paymentMethod === "pix_automatic" ? "Autorizar Pix Automático" : "Pagar com Pix"}
          </Text>
          <EloCard style={styles.pixCard}>
            <View style={styles.qrWrap}>
              <QRCode value={paymentResult.pixPayload} size={190} />
            </View>
            <Text style={styles.pixTitle}>
              {paymentResult.paymentMethod === "pix_automatic"
                ? "Escaneie e autorize a mensalidade no seu banco"
                : "Escaneie com o aplicativo de qualquer banco"}
            </Text>
            <Text style={styles.helperText}>
              {paymentResult.paymentMethod === "pix_automatic"
                ? "O primeiro Pix paga a mensalidade e autoriza as próximas cobranças automáticas."
                : "Assim que o Pix for confirmado, o plano será liberado automaticamente."}
            </Text>
            <View style={styles.buttonGap}>
              <EloActionButton
                label="Copiar Pix Copia e Cola"
                icon="CopyIcon"
                variant="primary"
                onPress={() => void Clipboard.setStringAsync(paymentResult.pixPayload ?? "")}
              />
            </View>
            <View style={styles.buttonGapSmall}>
              <EloActionButton
                label="Já paguei • atualizar situação"
                icon="ArrowsClockwiseIcon"
                variant="secondary"
                onPress={() => void refreshContext({ silent: false })}
              />
            </View>
          </EloCard>
        </>
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
          const current = Boolean(
            !billing?.is_trial &&
            !billing?.is_blessed &&
            billing?.effective_plan_code === plan.code &&
            ["active", "canceled", "past_due"].includes(billing?.subscription_status ?? "")
          );
          const recurringCurrent = current && Boolean(billing?.can_cancel_subscription) && billing?.subscription_status === "active";
          const network = plan.code === "ELO_REDE";
          const isSelected = selectedPlanCode === plan.code;

          return (
            <EloCard
              key={plan.code}
              style={[
                styles.planCard,
                plan.recommended && styles.recommendedCard,
                current && styles.currentCard,
              ]}
            >
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
                    network
                      ? "Ver contratação consultiva"
                      : recurringCurrent
                        ? "Plano com renovação ativa"
                        : current
                          ? "Pagar próxima mensalidade"
                          : isSelected
                            ? "Fechar formas de pagamento"
                            : `Escolher ${plan.name}`
                  }
                  icon={network ? "BuildingsIcon" : recurringCurrent ? "CheckIcon" : "WalletIcon"}
                  variant={plan.recommended && !recurringCurrent ? "primary" : "secondary"}
                  disabled={recurringCurrent || Boolean(billing?.is_blessed)}
                  onPress={() => {
                    if (network) {
                      Alert.alert(
                        "Elo Rede",
                        "Esse plano é configurado conforme a estrutura e a quantidade de congregações. A contratação é feita diretamente com a Nethanel."
                      );
                      return;
                    }
                    setPaymentResult(null);
                    setSelectedPlanCode((currentCode) => currentCode === plan.code ? null : plan.code);
                  }}
                />
              </View>

              {isSelected && !network ? (
                <View style={styles.paymentMethods}>
                  <Text style={styles.paymentTitle}>Como deseja pagar?</Text>
                  <Text style={styles.paymentSubtitle}>O plano pertence à igreja, não ao banco nem ao e-mail do usuário.</Text>

                  {!capabilities?.asaasConfigured ? (
                    <View style={styles.providerNotice}>
                      <P.InfoIcon size={18} color="#6A5600" weight="duotone" />
                      <Text style={styles.providerNoticeText}>
                        Pix, boleto e cartão estão prontos no Elo, aguardando apenas a ativação final do provedor da Nethanel.
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.methodBlock}>
                    <View style={styles.methodHeader}>
                      <P.ArrowsClockwiseIcon size={22} color={eloColors.green} weight="duotone" />
                      <View style={styles.methodCopy}>
                        <Text style={styles.methodName}>Pix Automático</Text>
                        <Text style={styles.methodDescription}>Recomendado • autorize uma vez no seu banco e o Elo renova mensalmente.</Text>
                      </View>
                    </View>
                    <EloActionButton
                      label="Autorizar Pix Automático"
                      icon="QrCodeIcon"
                      variant="primary"
                      disabled={!capabilities?.asaasConfigured}
                      loading={paymentLoading === `${plan.code}:pix_automatic`}
                      onPress={() => void startAsaasPayment(plan, "pix_automatic")}
                    />
                  </View>

                  <View style={styles.methodBlock}>
                    <View style={styles.methodHeader}>
                      <P.QrCodeIcon size={22} color={eloColors.blue} weight="duotone" />
                      <View style={styles.methodCopy}>
                        <Text style={styles.methodName}>Pix desta mensalidade</Text>
                        <Text style={styles.methodDescription}>QR Code dinâmico. Pode pagar pelo aplicativo de qualquer banco.</Text>
                      </View>
                    </View>
                    <EloActionButton
                      label="Gerar Pix"
                      icon="QrCodeIcon"
                      variant="secondary"
                      disabled={!capabilities?.asaasConfigured}
                      loading={paymentLoading === `${plan.code}:pix`}
                      onPress={() => void startAsaasPayment(plan, "pix")}
                    />
                  </View>

                  <View style={styles.methodBlock}>
                    <View style={styles.methodHeader}>
                      <P.BarcodeIcon size={22} color="#745B00" weight="duotone" />
                      <View style={styles.methodCopy}>
                        <Text style={styles.methodName}>Boleto bancário</Text>
                        <Text style={styles.methodDescription}>Ideal para tesourarias que trabalham com contas a pagar e comprovantes.</Text>
                      </View>
                    </View>
                    <EloActionButton
                      label="Gerar boleto"
                      icon="BarcodeIcon"
                      variant="secondary"
                      disabled={!capabilities?.asaasConfigured}
                      loading={paymentLoading === `${plan.code}:boleto`}
                      onPress={() => void startAsaasPayment(plan, "boleto")}
                    />
                  </View>

                  <View style={styles.methodBlock}>
                    <View style={styles.methodHeader}>
                      <P.CreditCardIcon size={22} color="#5E4BB7" weight="duotone" />
                      <View style={styles.methodCopy}>
                        <Text style={styles.methodName}>Cartão</Text>
                        <Text style={styles.methodDescription}>O cartão é informado na página segura do provedor. O Elo não armazena dados do cartão.</Text>
                      </View>
                    </View>
                    <EloActionButton
                      label="Pagar com cartão"
                      icon="CreditCardIcon"
                      variant="secondary"
                      disabled={!capabilities?.asaasConfigured}
                      loading={paymentLoading === `${plan.code}:card`}
                      onPress={() => void startAsaasPayment(plan, "card")}
                    />
                  </View>

                  {capabilities?.mercadoPagoAvailable !== false ? (
                    <View style={styles.alternativeBlock}>
                      <Text style={styles.alternativeTitle}>Alternativa</Text>
                      <Text style={styles.methodDescription}>Se preferir, ainda é possível usar a assinatura pelo Mercado Pago.</Text>
                      <View style={styles.buttonGapSmall}>
                        <EloActionButton
                          label="Continuar pelo Mercado Pago"
                          icon="CreditCardIcon"
                          variant="secondary"
                          loading={paymentLoading === `${plan.code}:mercado_pago`}
                          onPress={() => void startMercadoPago(plan)}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </EloCard>
          );
        })
      )}

      <View style={styles.bottomInfo}>
        <P.ShieldCheckIcon size={20} color={eloColors.green} weight="duotone" />
        <Text style={styles.bottomInfoText}>
          O Nethanel Billing controla vencimento, tolerância e liberação do plano. O provedor de pagamento apenas confirma que a mensalidade foi recebida.
        </Text>
      </View>
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 28,
    alignItems: "center",
  },
  currentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  currentIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#F4F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  currentCopy: {
    flex: 1,
  },
  currentPlan: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17202A",
  },
  currentMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#66717D",
  },
  infoRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E9EE",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLabel: {
    color: "#68727D",
    fontSize: 13,
  },
  infoValue: {
    color: "#1E2933",
    fontSize: 13,
    fontWeight: "700",
  },
  cancelButton: {
    marginTop: 16,
  },
  blessedCard: {
    backgroundColor: "#FFF8DE",
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#FFF8DE",
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
  },
  noticeText: {
    flex: 1,
    color: "#674F00",
    fontSize: 13,
    lineHeight: 19,
  },
  helperText: {
    color: "#65717D",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#35414D",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#DDE3E9",
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    color: "#15202B",
    fontSize: 15,
  },
  fieldHint: {
    marginTop: 5,
    color: "#7B8792",
    fontSize: 12,
  },
  buttonGap: {
    marginTop: 18,
  },
  buttonGapSmall: {
    marginTop: 10,
  },
  pixCard: {
    alignItems: "center",
  },
  qrWrap: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E6EAEE",
    marginBottom: 14,
  },
  pixTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#18222D",
    textAlign: "center",
    marginBottom: 6,
  },
  planCard: {
    marginBottom: 12,
  },
  recommendedCard: {
    borderWidth: 1.5,
    borderColor: "#D6B84A",
  },
  currentCard: {
    borderWidth: 1.5,
    borderColor: "#78B58D",
  },
  planTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17202A",
  },
  recommendedBadge: {
    backgroundColor: "#FFF1A8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  recommendedBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#6A5600",
  },
  currentBadge: {
    backgroundColor: "#DFF3E5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#28613B",
  },
  planDescription: {
    marginTop: 7,
    color: "#69747E",
    fontSize: 13,
    lineHeight: 19,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 15,
  },
  price: {
    fontSize: 25,
    fontWeight: "900",
    color: "#17202A",
  },
  perMonth: {
    marginLeft: 4,
    color: "#78838E",
    fontSize: 13,
  },
  features: {
    marginTop: 14,
    gap: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  featureText: {
    flex: 1,
    color: "#4D5964",
    fontSize: 13,
    lineHeight: 18,
  },
  planButton: {
    marginTop: 17,
  },
  paymentMethods: {
    marginTop: 18,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: "#E8ECF0",
  },
  paymentTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#18222D",
  },
  paymentSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    color: "#6D7882",
    fontSize: 13,
    lineHeight: 18,
  },
  providerNotice: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FFF8DE",
    borderRadius: 13,
    padding: 11,
    marginBottom: 12,
  },
  providerNoticeText: {
    flex: 1,
    color: "#685300",
    fontSize: 12,
    lineHeight: 17,
  },
  methodBlock: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4E9ED",
  },
  methodHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  methodCopy: {
    flex: 1,
  },
  methodName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#22303B",
  },
  methodDescription: {
    marginTop: 3,
    color: "#6A7680",
    fontSize: 12,
    lineHeight: 17,
  },
  alternativeBlock: {
    marginTop: 15,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#F6F8FA",
  },
  alternativeTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#596570",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bottomInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginTop: 8,
    marginBottom: 22,
    padding: 14,
    backgroundColor: "#F2F8F4",
    borderRadius: 16,
  },
  bottomInfoText: {
    flex: 1,
    color: "#486050",
    fontSize: 12,
    lineHeight: 18,
  },
});
