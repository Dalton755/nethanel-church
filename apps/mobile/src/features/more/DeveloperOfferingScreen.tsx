import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Phosphor from "phosphor-react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import { EloActionButton, EloCard, EloScreen, EloState, eloColors, eloSharedStyles } from "../elo/EloUi";

const P = Phosphor as any;
type Frequency = "once" | "monthly";
type Method = "pix" | "card" | "boleto";

type Contribution = {
  id: string;
  amount_cents: number;
  frequency: Frequency;
  payment_method: Method;
  status: string;
  created_at: string;
  checkout_url: string | null;
  can_cancel: boolean;
};

const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const safeLink = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      (u.hostname === "asaas.com" || u.hostname.endsWith(".asaas.com"));
  } catch { return false; }
};
const SUGGESTED_AMOUNTS_CENTS = [2000, 5000, 10000, 20000] as const;
const TEST_ORG_ID = "101212c5-6e81-4915-ae9a-fbde5b42bb04";

const statusName: Record<string, string> = {
  draft: "Preparando",
  processing: "Gerando cobrança",
  pending: "Aguardando pagamento",
  paid: "Pagamento confirmado",
  canceled: "Cancelada",
  failed: "Falha ao gerar",
  refunded: "Reembolsada",
};

function Choice({ label, active, onPress }: {
  label: string; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }}
      onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function DeveloperOfferingScreen({ onBack }: { onBack: () => void }) {
  const { activeOrganization } = useOrganization();
  const [frequency, setFrequency] = useState<Frequency>("once");
  const [method, setMethod] = useState<Method>("pix");
  const [centsText, setCentsText] = useState("");
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [sandbox, setSandbox] = useState(true);
  const [history, setHistory] = useState<Contribution[]>([]);
  const [workingCancel, setWorkingCancel] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isDemo = activeOrganization?.id === TEST_ORG_ID;

  const cents = Number(centsText || "0");
  const reload = useCallback(async () => {
    if (!activeOrganization || activeOrganization.id !== TEST_ORG_ID) {
      setEnabled(false);
      setHistory([]);
      setLoaded(true);
      return;
    }
    const [capability, list] = await Promise.all([
      supabase.functions.invoke("elo-developer-donations", {
        body: { action: "capabilities" },
      }),
      supabase.rpc("list_my_elo_developer_donations", {
        p_organization_id: activeOrganization.id,
      }),
    ]);
    setEnabled(!capability.error && capability.data?.ok === true &&
      capability.data?.configured === true && capability.data?.sandbox === true);
    setSandbox(capability.data?.sandbox !== false);
    if (!list.error && Array.isArray(list.data)) setHistory(list.data as Contribution[]);
    setLoaded(true);
  }, [activeOrganization?.id]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => listener.remove();
  }, [reload]);

  const refreshHistory = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await reload(); }
    finally { setRefreshing(false); }
  };

  function confirmCreate() {
    if (!activeOrganization || !isDemo || !Number.isSafeInteger(cents) ||
        cents < 500 || cents > 5000000) {
      Alert.alert("Valor inválido", "Digite um valor entre R$ 5,00 e R$ 50.000,00.");
      return;
    }
    const frequencyText = frequency === "monthly"
      ? "Esta é uma contribuição mensal recorrente até que seja cancelada. "
      : "Esta é uma contribuição única. ";
    Alert.alert(
      "Confirmar oferta voluntária?",
      `${frequencyText}Valor: ${brl(cents)}. Esta é uma SIMULAÇÃO no Asaas Sandbox: não realize transferência real. Os recursos da igreja não dependem da oferta.`,
      [
        { text: "Voltar", style: "cancel" },
        { text: "Continuar no Asaas", onPress: () => void startOffering() },
      ],
    );
  }

  async function startOffering() {
    if (!activeOrganization || !isDemo || creating) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("elo-developer-donations", {
        body: {
          action: "create",
          organizationId: activeOrganization.id,
          amountCents: cents,
          frequency,
          method,
        },
      });
      if (error || !data?.ok || !data.checkoutUrl || !safeLink(data.checkoutUrl))
        throw new Error(data?.message ?? error?.message ?? "Não foi possível preparar a oferta.");
      await reload();
      await WebBrowser.openBrowserAsync(data.checkoutUrl);
      await reload();
      Alert.alert("Cobrança de teste preparada!",
        "Acesse o Asaas Sandbox para simular a confirmação. Ao retornar, toque em Atualizar histórico. Nenhum dinheiro real será cobrado.");
    } catch (error) {
      Alert.alert("Oferta não gerada",
        error instanceof Error ? error.message : "Tente novamente mais tarde.");
    } finally {
      setCreating(false);
    }
  }

  function confirmCancel(item: Contribution) {
    Alert.alert("Cancelar oferta mensal?",
      "As próximas cobranças da contribuição voluntária serão encerradas no Asaas. O acesso da igreja continuará gratuito.",
      [
        { text: "Manter contribuição", style: "cancel" },
        { text: "Cancelar contribuição", style: "destructive",
          onPress: () => void cancelMonthly(item) },
      ]);
  }

  async function cancelMonthly(item: Contribution) {
    if (!isDemo) return;
    setWorkingCancel(item.id);
    const { data, error } = await supabase.functions.invoke("elo-developer-donations", {
      body: { action: "cancel", id: item.id },
    });
    setWorkingCancel(null);
    if (error || !data?.ok) {
      Alert.alert("Não foi possível cancelar",
        data?.message ?? error?.message ?? "Entre em contato com o suporte.");
      return;
    }
    await reload();
    Alert.alert("Contribuição cancelada", "As próximas ofertas mensais foram encerradas.");
  }

  return (
    <EloScreen title="Ofertar ao desenvolvedor"
      eyebrow="APOIO VOLUNTÁRIO • NETHANEL"
      subtitle="Apoie a continuidade do Elo, somente se desejar."
      onBack={onBack}>
      <EloCard style={styles.message}>
        <View style={styles.topMessage}>
          <P.HandHeartIcon size={27} color="#9A6700" weight="duotone" />
          <Text style={styles.headline}>Uma tecnologia para servir</Text>
        </View>
        <Text style={styles.body}>
          O Nethanel Elo foi criado para ajudar as igrejas a crescerem,
          organizar seu trabalho e servir melhor às pessoas.
          Não queremos transformar a fé em cobrança nem tirar dinheiro das igrejas.
        </Text>
        <Text style={styles.body}>
          Todos os recursos do aplicativo são gratuitos. Porém, manter o banco de dados,
          os servidores e a segurança funcionando gera custos.
          Quem desejar pode contribuir voluntariamente para a manutenção do projeto.
        </Text>
        <Text style={styles.free}>Sua oferta é opcional e não libera vantagens ou recursos adicionais.</Text>
      </EloCard>

      <Text style={eloSharedStyles.sectionTitle}>Como deseja ofertar?</Text>
      <View style={styles.options}>
        <Choice label="Oferta única" active={frequency === "once"}
          onPress={() => setFrequency("once")} />
        <Choice label="Oferta mensal" active={frequency === "monthly"}
          onPress={() => setFrequency("monthly")} />
      </View>

      <Text style={eloSharedStyles.sectionTitle}>Valor da oferta</Text>
      <EloCard style={styles.amountCard}>
        <Text style={styles.amountSectionLabel}>Escolha um valor sugerido</Text>
        <View style={styles.amountSuggestions}>
          {SUGGESTED_AMOUNTS_CENTS.map((amountCents) => {
            const selected = centsText !== "" && cents === amountCents;
            return (
              <Pressable
                key={amountCents}
                accessibilityRole="button"
                accessibilityLabel={`Ofertar ${brl(amountCents)}`}
                accessibilityState={{ selected }}
                onPress={() => setCentsText(String(amountCents))}
                style={[styles.amountSuggestion, selected && styles.amountSuggestionSelected]}
              >
                <Text style={[styles.amountSuggestionText,
                  selected && styles.amountSuggestionTextSelected]}>
                  {brl(amountCents).replace(",00", "")}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.amountSectionLabel}>Ou digite o valor que deseja ofertar</Text>
        <TextInput
          accessibilityLabel="Outro valor da oferta em reais, mínimo de cinco reais"
          style={styles.amountInput}
          keyboardType="number-pad"
          value={centsText ? brl(cents) : ""}
          onChangeText={value => setCentsText(value.replace(/\D/g, "").slice(0, 7))}
          placeholder="R$ 0,00"
          placeholderTextColor={eloColors.muted}
          maxLength={17}
        />
        <Text style={styles.smallNote}>Valor mínimo: R$ 5,00.</Text>
      </EloCard>

      <Text style={eloSharedStyles.sectionTitle}>Forma de pagamento</Text>
      <View style={styles.options}>
        <Choice label="Pix" active={method === "pix"} onPress={() => setMethod("pix")} />
        <Choice label="Cartão" active={method === "card"} onPress={() => setMethod("card")} />
        <Choice label="Boleto" active={method === "boleto"} onPress={() => setMethod("boleto")} />
      </View>
      {frequency === "monthly" ? (
        <Text style={styles.notice}>
          Na opção mensal, o Asaas criará uma recorrência.
          Para Pix, será gerado boleto com QR Pix, pago manualmente a cada mês.
          No cartão, a cobrança poderá ocorrer automaticamente.
          Você poderá cancelar as próximas cobranças.
        </Text>
      ) : null}
      {!loaded ? <ActivityIndicator style={styles.loading} color={eloColors.blue} /> : null}
      {loaded && !enabled ? (
        <EloState title="Ofertas em preparação"
          description="A integração segura com o Asaas ainda está sendo ativada. O Elo continua totalmente gratuito."
          icon="InfoIcon" />
      ) : null}
      {isDemo && <Text style={styles.preview}>
        SIMULAÇÃO • ASAAS SANDBOX — Nenhum valor real será cobrado.
      </Text>}
      {!isDemo && <EloState title="Teste restrito à igreja Demo"
        description="A geração de ofertas está em homologação. Nas demais igrejas, o recurso será ativado somente após aprovação."
        icon="InfoIcon" />}
      <View style={styles.payButton}>
        <EloActionButton
          label={sandbox ? "Gerar teste no Asaas" : "Gerar oferta pelo Asaas"}
          icon="HeartIcon"
          disabled={!enabled || !isDemo || cents < 500 || cents > 5000000}
          loading={creating}
          onPress={confirmCreate}
        />
      </View>

      <View style={styles.historyHeader}>
        <Text style={eloSharedStyles.sectionTitle}>Minhas ofertas</Text>
        {isDemo ? (
          <Pressable accessibilityRole="button" onPress={() => void refreshHistory()}
            disabled={refreshing} style={styles.refreshButton}>
            {refreshing ? <ActivityIndicator size="small" color={eloColors.blue} /> :
              <P.ArrowClockwiseIcon size={17} color={eloColors.blue} />}
            <Text style={styles.refreshText}>Atualizar histórico</Text>
          </Pressable>
        ) : null}
      </View>
      {history.length === 0 ? (
        <Text style={styles.smallNote}>Nenhuma oferta registrada. Contribuir é sempre opcional.</Text>
      ) : history.map(item => (
        <EloCard key={item.id} style={styles.history}>
          <Text style={styles.historyTitle}>{brl(item.amount_cents)} • {
            item.frequency === "monthly" ? "Mensal" : "Única"}</Text>
          <Text style={styles.smallNote}>{statusName[item.status] ?? item.status}</Text>
          {item.checkout_url && item.status==="pending" && safeLink(item.checkout_url) ? (
            <EloActionButton label="Abrir cobrança" variant="secondary"
              icon="ArrowSquareOutIcon" onPress={() => void WebBrowser.openBrowserAsync(item.checkout_url!)} />
          ) : null}
          {item.can_cancel ? (
            <EloActionButton label="Cancelar oferta mensal" variant="danger"
              loading={workingCancel===item.id} onPress={() => confirmCancel(item)} />
          ) : null}
        </EloCard>
      ))}
    </EloScreen>
  );
}

const styles=StyleSheet.create({
  message:{ marginTop: 15, gap: 12, backgroundColor: "#FFFCF4" },
  topMessage:{ flexDirection:"row",alignItems:"center",gap:10 },
  headline:{ fontSize:18,fontWeight:"900",color:eloColors.ink,flex:1 },
  body:{ fontSize:14,lineHeight:22,color:eloColors.ink },
  free:{ fontSize:12,lineHeight:18,fontWeight:"800",color:eloColors.green },
  options:{ flexDirection:"row",flexWrap:"wrap",gap:8 },
  choice:{
    minHeight:44,paddingHorizontal:13,paddingVertical:10,borderRadius:13,
    borderWidth:1,borderColor:eloColors.line,backgroundColor:"#FFFFFF",
    alignItems:"center",justifyContent:"center",
  },
  choiceActive:{ borderColor:eloColors.blue,backgroundColor:eloColors.surfaceSoft },
  choiceText:{ fontSize:13,color:eloColors.muted,fontWeight:"700" },
  choiceTextActive:{ color:eloColors.blue },
  amountCard:{ gap:12 },
  amountSectionLabel:{ fontSize:13,fontWeight:"700",color:eloColors.ink },
  amountSuggestions:{ flexDirection:"row",flexWrap:"wrap",gap:9 },
  amountSuggestion:{
    flexBasis:"46%",flexGrow:1,minHeight:49,borderRadius:13,
    borderWidth:1,borderColor:eloColors.line,backgroundColor:"#FFFFFF",
    alignItems:"center",justifyContent:"center",paddingHorizontal:10,
  },
  amountSuggestionSelected:{
    borderColor:eloColors.blue,backgroundColor:eloColors.surfaceSoft,
  },
  amountSuggestionText:{ fontSize:16,fontWeight:"800",color:eloColors.ink },
  amountSuggestionTextSelected:{ color:eloColors.blue },
  amountInput:{ width:"100%",paddingHorizontal:14,height:44,borderRadius:12,
    borderWidth:1,borderColor:eloColors.line,color:eloColors.ink,fontSize:16 },
  smallNote:{ fontSize:12,color:eloColors.muted,lineHeight:19 },
  notice:{ marginTop:12,fontSize:12,lineHeight:19,color:"#8A5B00",
    backgroundColor:"#FFF8E8",padding:13,borderRadius:14 },
  loading:{ marginVertical:18 },
  preview:{ marginTop:12,fontWeight:"800",fontSize:12,color:"#9A6700" },
  payButton:{ marginTop:16 },
  historyHeader:{ marginTop:16, flexDirection:"row",flexWrap:"wrap",
    justifyContent:"space-between",alignItems:"center",gap:8 },
  refreshButton:{ flexDirection:"row",alignItems:"center",gap:6,
    paddingHorizontal:10,minHeight:40,borderRadius:12,backgroundColor:eloColors.surfaceSoft },
  refreshText:{ fontSize:12,fontWeight:"800",color:eloColors.blue },
  history:{ marginTop:10,gap:8 },
  historyTitle:{ fontSize:15,fontWeight:"800",color:eloColors.ink },
});
