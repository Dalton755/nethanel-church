import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Phosphor from "phosphor-react-native";

import { supabase } from "../../lib/supabase";
import {
  EloActionButton, EloCard, EloScreen, EloState,
  eloColors, eloSharedStyles,
} from "../elo/EloUi";
import { PlatformAppUpdatesScreen } from "./PlatformAppUpdatesScreen";

const P = Phosphor as any;

type PlatformSummary = {
  clients: number;
  people: number;
};

type Client = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: string;
  created_at: string;
  people_count: number;
  contact_name: string | null;
};

type Dashboard = {
  summary: PlatformSummary;
  clients: Client[];
};

export function PlatformAdminScreen({ onBack }: { onBack: () => void }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatesOpen, setUpdatesOpen] = useState(false);

  const [checkingAsaas, setCheckingAsaas] = useState(false);
  const [asaasDiagnostic, setAsaasDiagnostic] = useState<string | null>(null);

  const checkAsaasConnection = useCallback(async () => {
    if (checkingAsaas) return;
    setCheckingAsaas(true);
    setAsaasDiagnostic(null);
    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "elo-asaas-production-health", { body: { action: "check" } },
      );
      if (functionError || !data?.ok) {
        setAsaasDiagnostic("Não foi possível verificar agora. Confirme seu acesso de administrador e tente novamente.");
        return;
      }
      const status: Record<string, string> = {
        connected: "Conexão Asaas PRODUÇÃO validada! Chave Pix ativa localizada. Nenhuma cobrança foi criada.",
        no_active_pix: "Conexão validada, mas nenhuma chave Pix ativa foi localizada nessa conta.",
        key_missing: "A chave de produção não foi encontrada nos Secrets do Supabase.",
        invalid_environment: "A chave configurada não parece ser do Asaas de produção.",
        not_authorized: "O Asaas recusou a chave API. Confira se está ativa e pertence à conta de produção.",
        api_access_restricted: "O Asaas bloqueou a consulta. Confira permissões e restrições de IP da chave.",
        provider_rate_limited: "O Asaas limitou as consultas. Aguarde e tente novamente.",
        provider_unavailable: "O Asaas não respondeu à consulta da chave Pix. Tente novamente.",
        unexpected_response: "O Asaas respondeu, mas não foi possível validar a lista de chaves Pix.",
        network_error: "Não foi possível estabelecer a conexão. Verifique a rede e tente novamente.",
      };
      const webhookStates: Record<string, string> = {
        ready: "Token do Webhook: formato válido e armazenado no Supabase. O Webhook ainda não foi cadastrado no Asaas.",
        missing: "Token do Webhook: não encontrado. Confira o Secret no Supabase.",
        invalid: "Token do Webhook: inválido (32 a 255 caracteres, sem espaços).",
        same_as_api_key: "Token do Webhook: use um segredo diferente da chave API.",
        same_as_sandbox: "Token do Webhook: use um segredo diferente do Sandbox.",
      };
      const connection = status[data.code as string] ??
        "A verificação da conexão não foi concluída. Nenhum pagamento foi criado.";
      const webhookStatus = webhookStates[data.webhookSecretStatus as string] ??
        "Não foi possível verificar a configuração do token do Webhook.";
      setAsaasDiagnostic(connection + "\n\n" + webhookStatus +
        "\n\nPagamentos reais continuam desativados.");
    } catch {
      setAsaasDiagnostic("Erro ao verificar conexão. Nenhum pagamento foi criado.");
    } finally {
      setCheckingAsaas(false);
    }
  }, [checkingAsaas]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("platform_admin_dashboard");
    if (rpcError) {
      setError(rpcError.message);
      setDashboard(null);
    } else {
      setDashboard(data as Dashboard);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (updatesOpen) {
    return <PlatformAppUpdatesScreen onBack={() => setUpdatesOpen(false)} />;
  }

  return (
    <EloScreen
      eyebrow="NETHANEL • PLATAFORMA"
      title="Painel Nethanel"
      subtitle="Gestão das igrejas, aplicativos e manutenção da plataforma."
      onBack={onBack}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Atualizar painel"
          style={styles.refresh}
          onPress={() => void load()}
        >
          <P.ArrowsClockwiseIcon size={20} color={eloColors.ink} />
        </Pressable>
      }
    >
      {loading ? (
        <ActivityIndicator color={eloColors.blue} style={styles.loading} size="large" />
      ) : error ? (
        <EloState title="Painel indisponível"
          description={error} icon="LockKeyIcon" />
      ) : dashboard ? (
        <>
          <EloCard style={styles.gratitudeCard}>
            <P.HandHeartIcon size={28} color="#A97917" weight="duotone" />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Uma ferramenta gratuita para servir</Text>
              <Text style={styles.cardDescription}>
                O Nethanel Elo oferece recursos completos para as igrejas,
                sem mensalidade de acesso. O apoio voluntário aos custos de infraestrutura
                será mantido separado da experiência dos membros.
              </Text>
            </View>
          </EloCard>

          <Text style={eloSharedStyles.sectionTitle}>Visão geral</Text>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{dashboard.summary.clients}</Text>
              <Text style={styles.metricLabel}>Igrejas</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{dashboard.summary.people}</Text>
              <Text style={styles.metricLabel}>Pessoas cadastradas</Text>
            </View>
          </View>

          <Text style={eloSharedStyles.sectionTitle}>Integração Asaas</Text>
          <EloCard style={styles.updatesCard}>
            <View style={styles.updatesHead}>
              <View style={styles.updatesIcon}>
                <P.ShieldCheckIcon color={eloColors.blue} size={22} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Validar conexão de produção</Text>
                <Text style={styles.cardDescription}>
                  Consulta a conexão Asaas, chave Pix e configuração do Webhook.
                  Não gera cobranças. As ofertas reais continuam desativadas.
                </Text>
              </View>
            </View>
            <EloActionButton
              label="Verificar conexão Asaas"
              icon="ShieldCheckIcon"
              variant="secondary"
              loading={checkingAsaas}
              disabled={checkingAsaas}
              onPress={() => void checkAsaasConnection()}
            />
            {asaasDiagnostic ? (
              <Text style={styles.checkResult}>{asaasDiagnostic}</Text>
            ) : null}
          </EloCard>

          <Text style={eloSharedStyles.sectionTitle}>Aplicativos das igrejas</Text>
          <EloCard style={styles.updatesCard}>
            <View style={styles.updatesHead}>
              <View style={styles.updatesIcon}>
                <P.ArrowsClockwiseIcon color={eloColors.blue} size={22} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Central de Atualizações</Text>
                <Text style={styles.cardDescription}>
                  Controle versões, APKs exclusivos, simulações e liberações por igreja.
                </Text>
              </View>
            </View>
            <EloActionButton label="Gerenciar atualizações" icon="ArrowRightIcon"
              onPress={() => setUpdatesOpen(true)} />
          </EloCard>

          <Text style={eloSharedStyles.sectionTitle}>Igrejas</Text>
          <View style={styles.churches}>
            {dashboard.clients.map(church => (
              <EloCard key={church.id}>
                <View style={styles.churchLine}>
                  <P.ChurchIcon size={21} color={eloColors.blue} weight="duotone" />
                  <View style={styles.cardText}>
                    <Text style={styles.churchName}>{church.name}</Text>
                    <Text style={styles.cardDescription}>
                      {[church.city,church.state].filter(Boolean).join(" • ") || "Local não informado"}
                      {" • "}{church.people_count} pessoas
                    </Text>
                  </View>
                </View>
              </EloCard>
            ))}
          </View>
          <Text style={styles.hint}>
            As contribuições ao desenvolvedor são voluntárias e não influenciam os
            recursos ou as permissões de nenhuma igreja.
          </Text>
        </>
      ) : null}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  refresh: { height: 42, width: 42, borderRadius: 13,
    borderWidth: 1, borderColor: eloColors.line,
    backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  loading: { marginVertical: 70 },
  gratitudeCard: { marginTop: 17, flexDirection: "row", alignItems: "flex-start",
    gap: 12, backgroundColor: "#FFFCF4" },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "900", color: eloColors.ink },
  cardDescription: { fontSize: 12, lineHeight: 18, marginTop: 4, color: eloColors.muted },
  metrics: { flexDirection: "row", gap: 10 },
  metric: { flex: 1, padding: 16, backgroundColor: "#FFFFFF", borderWidth: 1,
    borderColor: eloColors.line, borderRadius: 18 },
  metricValue: { fontSize: 28, fontWeight: "900", color: eloColors.ink },
  metricLabel: { fontSize: 12, color: eloColors.muted },
  updatesCard: { gap: 15 },
  updatesHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  updatesIcon: { height: 43, width: 43, backgroundColor: eloColors.surfaceSoft,
    borderRadius: 14, alignItems: "center", justifyContent: "center" },
  churches: { gap: 10 },
  churchLine: { flexDirection: "row", alignItems: "center", gap: 12 },
  churchName: { fontSize: 14, fontWeight: "900", color: eloColors.ink },
  checkResult: { fontSize: 12, color: eloColors.ink, lineHeight: 18 },
  hint: { marginTop: 19, fontSize: 11, color: eloColors.muted, lineHeight: 18 },
});
