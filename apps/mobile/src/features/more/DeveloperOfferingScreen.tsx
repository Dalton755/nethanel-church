import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import * as WebBrowser from "expo-web-browser";
import * as Phosphor from "phosphor-react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import { EloActionButton, EloCard, EloScreen, eloColors, eloSharedStyles } from "../elo/EloUi";

const P = Phosphor as any;
type Frequency = "once" | "monthly";
type Method = "pix" | "card" | "boleto";
type PixDisplay = {
  id: string; payload: string; amountCents: number; expiresAt: string | null;
  month?: string | null;
};
type MonthlyCycle = { month:string;status:string;paid_at:string|null };

type Contribution = {
  id: string;
  amount_cents: number;
  frequency: Frequency;
  payment_method: Method;
  status: string;
  created_at: string;
  checkout_url: string | null;
  can_cancel: boolean;
  monthly_cycles?: MonthlyCycle[];
};

const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const monthLabel = (period: string) => {
  const date = new Date(period.slice(0, 10) + "T12:00:00");
  return Number.isNaN(date.getTime()) ? period : new Intl.DateTimeFormat("pt-BR",{
    month:"long",year:"numeric",
  }).format(date);
};
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
  const { activeOrganization, organizations, selectOrganization } = useOrganization();
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
  const [switchingDemo, setSwitchingDemo] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState("");
  const [pixDisplay, setPixDisplay] = useState<PixDisplay | null>(null);
  const [loadingPixId, setLoadingPixId] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const isDemo = activeOrganization?.id === TEST_ORG_ID;
  const demoOrganization = organizations.find((org) => org.id === TEST_ORG_ID) ?? null;

  const cents = Number(centsText || "0");
  const reload = useCallback(async () => {
    if (!activeOrganization || activeOrganization.id !== TEST_ORG_ID) {
      setEnabled(false);
      setConnectionIssue("");
      setHistory([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const [capability, list] = await Promise.all([
      supabase.functions.invoke("elo-developer-donations", {
        body: { action: "capabilities" },
      }),
      supabase.rpc("list_my_elo_developer_donations", {
        p_organization_id: activeOrganization.id,
      }),
    ]);
    const available = !capability.error && capability.data?.ok === true &&
      capability.data?.configured === true && capability.data?.sandbox === true;
    setEnabled(available);
    setConnectionIssue(available ? "" : (
      capability.data?.configured === false
        ? "A chave de teste do Asaas ainda não foi reconhecida no Supabase."
        : "Não foi possível confirmar a conexão com o Sandbox. Tente verificar novamente."
    ));
    setSandbox(true);
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

  const openDemoForTesting = async () => {
    if (!demoOrganization || switchingDemo) return;
    setSwitchingDemo(true);
    try {
      await selectOrganization(demoOrganization.id);
      setLoaded(false);
      setEnabled(false);
    } catch (error) {
      Alert.alert("Não foi possível abrir a igreja Demo",
        error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setSwitchingDemo(false);
    }
  };

  async function copyPix() {
    if (!pixDisplay) return;
    try {
      await Clipboard.setStringAsync(pixDisplay.payload);
      setPixCopied(true);
    } catch {
      Alert.alert("Erro ao copiar", "Não foi possível copiar o código Pix.");
    }
  }

  async function openSavedPix(item: Contribution) {
    if (!isDemo || loadingPixId) return;
    setLoadingPixId(item.id);
    try {
      const {data,error} = await supabase.functions.invoke("elo-developer-donations",{
        body:{action:item.frequency==="monthly" ? "monthly_pix" : "pix",id:item.id},
      });
      if(error || !data?.ok) throw new Error(
        data?.message ?? error?.message ?? "Não foi possível recuperar o QR Code Pix."
      );
      if(data.alreadyPaid){
        await reload();
        Alert.alert("Oferta deste mês confirmada",
          `O Pix de ${monthLabel(data.month)} já foi pago. Um novo Pix ficará disponível no próximo mês.`);
        return;
      }
      if(typeof data.pixPayload!=="string" || data.pixPayload.length<30)
        throw new Error("O Pix do mês não está disponível.");
      setPixCopied(false);
      setPixDisplay({id:item.id,payload:data.pixPayload,
        amountCents:data.amountCents,expiresAt:data.expiresAt ?? null,
        month:data.month ?? null});
    }catch(error){
      Alert.alert("Pix indisponível",error instanceof Error ? error.message :
        "Tente novamente mais tarde.");
    }finally{setLoadingPixId(null);}
  }

  function confirmCreate() {
    if (!activeOrganization || !isDemo || !Number.isSafeInteger(cents) ||
        cents < 500 || cents > 5000000) {
      Alert.alert("Valor inválido", "Digite um valor entre R$ 5,00 e R$ 50.000,00.");
      return;
    }
    const frequencyText = frequency === "monthly" && method === "pix"
      ? "Esta é uma intenção de ofertar mensalmente, com um Pix manual diferente por mês. Não existe débito automático. "
      : frequency === "monthly"
      ? "Esta opção cria uma cobrança mensal gerenciada pelo Asaas até o cancelamento. "
      : "Esta é uma contribuição única. ";
    Alert.alert(
      "Confirmar oferta voluntária?",
      `${frequencyText}Valor: ${brl(cents)}. Esta é uma SIMULAÇÃO no Asaas Sandbox: não realize transferência real. Os recursos da igreja não dependem da oferta.`,
      [
        { text: "Voltar", style: "cancel" },
        { text: method === "pix" ?
            "Gerar QR Code no Elo" : "Continuar no Asaas",
          onPress: () => void startOffering() },
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
      if (error || !data?.ok) throw new Error(
        data?.message ?? error?.message ?? "Não foi possível preparar a oferta."
      );
      if(method === "pix") {
        if(data.alreadyPaid) {
          await reload();
          Alert.alert("Oferta deste mês confirmada",
            "Este mês já está pago. O próximo Pix poderá ser gerado no mês seguinte.");
          return;
        }
        if(typeof data.pixPayload !== "string" || data.pixPayload.length < 30)
          throw new Error("O Asaas Sandbox não retornou um Pix válido.");
        setPixCopied(false);
        setPixDisplay({id:data.id,payload:data.pixPayload,amountCents:cents,
          expiresAt:data.expiresAt ?? null,month:data.month ?? null});
        await reload();
        return;
      }
      if(!data.checkoutUrl || !safeLink(data.checkoutUrl))
        throw new Error("Não foi possível abrir a cobrança.");
      await reload();
      await WebBrowser.openBrowserAsync(data.checkoutUrl);
      await reload();
      Alert.alert("Cobrança de teste preparada!",
        "Acompanhe a confirmação pelo histórico. Nenhum dinheiro real será cobrado.");
    } catch (error) {
      Alert.alert("Oferta não gerada",
        error instanceof Error ? error.message : "Tente novamente mais tarde.");
    } finally {
      setCreating(false);
    }
  }

  function confirmCancel(item: Contribution) {
    Alert.alert("Cancelar oferta mensal?",
      item.payment_method==="pix" && !item.checkout_url
        ? "O compromisso voluntário mensal será encerrado e o Elo não gerará novos Pix. Um QR Code já emitido pode permanecer válido até expirar. O acesso continuará gratuito."
        : "As próximas cobranças da contribuição voluntária serão encerradas no Asaas. O acesso da igreja continuará gratuito.",
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
    Alert.alert("Contribuição cancelada",
      data.warning ?? "O Elo não gerará novas ofertas mensais. O acesso continuará gratuito.");
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
          {method==="pix"
            ? "Pix mensal voluntário: o QR Code aparece aqui no Elo. Cada mês terá um código próprio, gerado quando você solicitar. Sem débito automático, multa ou obrigação de pagar. Você pode cancelar quando quiser."
            : "Cartão ou boleto mensal: nesta etapa de testes, o Asaas gerencia a recorrência pelo checkout seguro. Você poderá cancelar as próximas cobranças."}
        </Text>
      ) : null}
      {!loaded ? <ActivityIndicator style={styles.loading} color={eloColors.blue} /> : null}
      {!isDemo ? (
        <EloCard style={styles.demoNotice}>
          <View style={styles.demoNoticeTitle}>
            <P.InfoIcon size={22} color={eloColors.blue} weight="duotone" />
            <Text style={styles.demoTitle}>Teste disponível na Elo Church Demo</Text>
          </View>
          <Text style={styles.demoBody}>
            Igreja selecionada: {activeOrganization?.name ?? "Nenhuma"}.
            Por segurança, a simulação de pagamentos está liberada somente para a igreja Demo.
          </Text>
          {demoOrganization ? (
            <EloActionButton label="Mudar para Elo Church Demo"
              icon="ArrowRightIcon" loading={switchingDemo}
              onPress={() => void openDemoForTesting()} />
          ) : (
            <Text style={styles.demoBody}>
              Esta conta não tem a igreja Demo na lista. Selecione uma conta
              com acesso à Elo Church Demo antes de testar.
            </Text>
          )}
        </EloCard>
      ) : (
        <View style={styles.sandboxNotice}>
          <P.ShieldCheckIcon size={18} color="#875B00" weight="duotone" />
          <Text style={styles.sandboxNote}>
            ASAAS SANDBOX • Simulação, sem movimentação de dinheiro real.
          </Text>
        </View>
      )}
      {isDemo && loaded && !enabled ? (
        <EloCard style={styles.demoNotice}>
          <Text style={styles.demoTitle}>Integração temporariamente indisponível</Text>
          <Text style={styles.demoBody}>{connectionIssue}</Text>
          <EloActionButton label="Verificar conexão"
            icon="ArrowClockwiseIcon" variant="secondary"
            onPress={() => void refreshHistory()} />
        </EloCard>
      ) : null}
      <View style={styles.payButton}>
        <EloActionButton
          label={method === "pix"
            ? "Gerar QR Code Pix" : "Gerar teste no Asaas"}
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
          <Text style={styles.smallNote}>
            {item.frequency==="monthly" && item.payment_method==="pix" && !item.checkout_url
              ? (item.status==="canceled"
                  ? "Compromisso mensal cancelado"
                  : "Compromisso voluntário ativo • pagamento manual a cada mês")
              : (statusName[item.status] ?? item.status)}
          </Text>
          {item.checkout_url && item.status==="pending" && safeLink(item.checkout_url) ? (
            <EloActionButton label="Abrir cobrança" variant="secondary"
              icon="ArrowSquareOutIcon" onPress={() => void WebBrowser.openBrowserAsync(item.checkout_url!)} />
          ) : null}
          {!item.checkout_url && item.payment_method === "pix" &&
            (item.frequency==="monthly" ? item.status!=="canceled" : item.status==="pending") ? (
            <EloActionButton label={item.frequency==="monthly"
                ? "Ver ou gerar Pix deste mês" : "Ver QR Code Pix"}
              variant="secondary" icon="QrCodeIcon" loading={loadingPixId===item.id}
              onPress={() => void openSavedPix(item)} />
          ) : null}
          {item.frequency==="monthly" && item.payment_method==="pix" && !item.checkout_url ?
            (item.monthly_cycles ?? []).slice(0,4).map(cycle => (
              <Text key={cycle.month} style={styles.smallNote}>
                {monthLabel(cycle.month)} • {statusName[cycle.status] ?? cycle.status}
              </Text>
            )) : null}
          {item.can_cancel ? (
            <EloActionButton label="Cancelar oferta mensal" variant="danger"
              loading={workingCancel===item.id} onPress={() => confirmCancel(item)} />
          ) : null}
        </EloCard>
      ))}

      <Modal visible={Boolean(pixDisplay)} transparent animationType="slide"
        onRequestClose={() => setPixDisplay(null)}>
        <View style={styles.pixOverlay}>
          <ScrollView contentContainerStyle={styles.pixModalScroll}>
            <View style={styles.pixCard}>
              <View style={styles.pixHeader}>
                <View style={styles.pixHeaderText}>
                  <Text style={styles.pixTitle}>Oferta por Pix</Text>
                  <Text style={styles.pixSubtitle}>
                    {pixDisplay?.month ? `Pix de ${monthLabel(pixDisplay.month)} • ` : ""}
                    Código gerado no Asaas Sandbox
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Fechar Pix"
                  onPress={() => setPixDisplay(null)} style={styles.pixClose}>
                  <P.XIcon size={22} color={eloColors.ink} />
                </Pressable>
              </View>
              <Text style={styles.pixAmount}>{brl(pixDisplay?.amountCents ?? 0)}</Text>
              <Text style={styles.pixSafety}>SIMULAÇÃO • NÃO REALIZE PAGAMENTO BANCÁRIO</Text>
              {pixDisplay?.payload ? (
                <View style={styles.pixQrFrame}>
                  <QRCode value={pixDisplay.payload} size={210}
                    backgroundColor="#FFFFFF" color="#172329" />
                </View>
              ) : null}
              <Text style={styles.pixInstructions}>
                Escaneie com uma conta de teste do Sandbox ou copie o código abaixo.
              </Text>
              <View style={styles.pixCodeContainer}>
                <Text selectable numberOfLines={4} style={styles.pixCode}>
                  {pixDisplay?.payload ?? ""}
                </Text>
              </View>
              <EloActionButton label={pixCopied ? "Código Pix copiado!" : "Copiar código Pix"}
                icon="CopyIcon" onPress={() => void copyPix()} />
              <EloActionButton label="Atualizar situação" variant="secondary"
                icon="ArrowClockwiseIcon" onPress={() => void refreshHistory()} />
              <Pressable onPress={() => setPixDisplay(null)} style={styles.pixDone}
                accessibilityRole="button">
                <Text style={styles.pixDoneText}>Voltar às ofertas</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  sandboxNotice:{ marginTop:14,flexDirection:"row",alignItems:"center",
    gap:8,paddingHorizontal:12,paddingVertical:11,borderRadius:12,backgroundColor:"#FFF8E8" },
  sandboxNote:{ fontSize:12,lineHeight:18,fontWeight:"700",color:"#875B00",flex:1 },
  demoNotice:{ marginTop:12,gap:12,padding:16 },
  demoNoticeTitle:{ flexDirection:"row",alignItems:"center",gap:10 },
  demoTitle:{ fontSize:14,fontWeight:"800",color:eloColors.ink,flex:1 },
  demoBody:{ fontSize:13,lineHeight:20,color:eloColors.muted },
  payButton:{ marginTop:16 },
  historyHeader:{ marginTop:16, flexDirection:"row",flexWrap:"wrap",
    justifyContent:"space-between",alignItems:"center",gap:8 },
  refreshButton:{ flexDirection:"row",alignItems:"center",gap:6,
    paddingHorizontal:10,minHeight:40,borderRadius:12,backgroundColor:eloColors.surfaceSoft },
  refreshText:{ fontSize:12,fontWeight:"800",color:eloColors.blue },
  history:{ marginTop:10,gap:8 },
  historyTitle:{ fontSize:15,fontWeight:"800",color:eloColors.ink },
  pixOverlay:{flex:1,justifyContent:"center",backgroundColor:"rgba(17,30,39,.65)"},
  pixModalScroll:{flexGrow:1,justifyContent:"center",padding:18},
  pixCard:{backgroundColor:"#FFFFFF",borderRadius:22,padding:20,gap:14},
  pixHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  pixHeaderText:{flex:1},
  pixTitle:{fontSize:19,fontWeight:"900",color:eloColors.ink},
  pixSubtitle:{fontSize:12,color:eloColors.muted,marginTop:3},
  pixClose:{minWidth:44,minHeight:44,justifyContent:"center",alignItems:"center"},
  pixAmount:{fontSize:26,fontWeight:"900",color:eloColors.ink,textAlign:"center"},
  pixSafety:{fontSize:11,fontWeight:"900",color:"#875B00",textAlign:"center"},
  pixQrFrame:{alignSelf:"center",padding:15,borderRadius:15,borderWidth:1,
    borderColor:eloColors.line,backgroundColor:"#FFFFFF"},
  pixInstructions:{fontSize:12,lineHeight:19,color:eloColors.muted,textAlign:"center"},
  pixCodeContainer:{borderRadius:12,borderWidth:1,borderColor:eloColors.line,
    padding:12,backgroundColor:eloColors.surfaceSoft},
  pixCode:{fontSize:11,lineHeight:16,color:eloColors.ink},
  pixDone:{alignItems:"center",justifyContent:"center",padding:10,minHeight:44},
  pixDoneText:{color:eloColors.blue,fontSize:14,fontWeight:"800"},
});
