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
  hint: { marginTop: 19, fontSize: 11, color: eloColors.muted, lineHeight: 18 },
});
