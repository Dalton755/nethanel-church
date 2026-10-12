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
  PlatformAppDistributionPlanner,
  type DistributionRelease,
} from "./PlatformAppDistributionPlanner";
import {
  EloActionButton,
  EloCard,
  EloScreen,
  EloState,
  eloColors,
  eloSharedStyles,
} from "../elo/EloUi";

const P = Phosphor as any;

type ReleaseStatus = "draft" | "testing" | "published" | "paused" | "rolled_back";
type ReleaseItem = {
  id: string;
  channel: "preview" | "production";
  version_name: string;
  version_code: number;
  minimum_supported_version_code: number;
  release_notes: string;
  status: ReleaseStatus;
  created_at: string;
  published_at: string | null;
  queued: number;
  building: number;
  ready: number;
  failed: number;
};

type ChurchItem = {
  id: string;
  name: string;
  status: string;
  apk_status: string | null;
  apk_version_code: number | null;
  apk_version_name: string | null;
  apk_release_id: string | null;
  has_apk: boolean;
  is_blessed: boolean;
  reports_count: number;
  reported_latest_version_code: number | null;
  reported_version_counts: { version_code: number; accounts: number }[];
};

type UpdatesDashboard = {
  releases: ReleaseItem[];
  churches: ChurchItem[];
  summary: {
    churches_with_apk: number;
    queued_builds: number;
    building_builds: number;
    accounts_reporting: number;
    next_version_code: number;
  };
};

const releaseLabels: Record<ReleaseStatus, string> = {
  draft: "Rascunho",
  testing: "Teste interno",
  published: "Publicada",
  paused: "Pausada",
  rolled_back: "Retirada",
};

const buildLabels: Record<string, string> = {
  queued: "Na fila",
  building: "Compilando",
  ready: "APK disponível",
  failed: "Falha no APK",
};

function fmtDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(date));
}

export function PlatformAppUpdatesScreen({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<UpdatesDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [channel, setChannel] = useState<"preview" | "production">("preview");
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [minimumVersion, setMinimumVersion] = useState("1");
  const [notes, setNotes] = useState("");
  const [planningRelease, setPlanningRelease] = useState<DistributionRelease | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await supabase.rpc("platform_admin_app_updates_dashboard");
    if (response.error) {
      setData(null);
      setErrorMessage(response.error.message);
    } else {
      const next = response.data as UpdatesDashboard;
      setErrorMessage(null);
      setData(next);
      if (!formOpen) {
        setVersionCode(String(next.summary.next_version_code));
        setVersionName(`1.0.${next.summary.next_version_code}`);
      }
    }
    setLoading(false);
  }, [formOpen]);

  useEffect(() => { void load(); }, [load]);

  async function createDraft() {
    const code = Number(versionCode);
    const minimum = Number(minimumVersion);
    if (!/^\d+\.\d+\.\d+$/.test(versionName.trim()) ||
        !Number.isSafeInteger(code) || code < (data?.summary.next_version_code ?? 1) ||
        !Number.isSafeInteger(minimum) || minimum < 1 || minimum > code) {
      Alert.alert("Confira a versão",
        "Use 1.0.7, por exemplo. O código Android deve ser maior que o das versões anteriores.");
      return;
    }
    setWorking("draft");
    const { error } = await supabase.rpc("platform_admin_create_app_release_draft", {
      p_channel: channel,
      p_version_name: versionName.trim(),
      p_version_code: code,
      p_release_notes: notes.trim(),
      p_minimum_supported_version_code: minimum,
    });
    setWorking(null);
    if (error) {
      Alert.alert("Não foi possível criar", error.message);
      return;
    }
    setFormOpen(false);
    setNotes("");
    Alert.alert("Rascunho salvo",
      "A versão está cadastrada. Nenhuma igreja recebeu uma atualização.");
    await load();
  }

  function confirmDraft() {
    Alert.alert(
      "Salvar versão como rascunho?",
      channel === "production"
        ? "Será apenas um planejamento para produção. Nada será publicado, compilado ou enviado."
        : "A versão ficará em prévia interna. Nada será publicado ou enviado às igrejas.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Criar rascunho", onPress: () => void createDraft() },
      ],
    );
  }

  async function changeStatus(release: ReleaseItem, status: "testing" | "paused" | "rolled_back") {
    setWorking(release.id);
    const { error } = await supabase.rpc("platform_admin_set_app_release_status", {
      p_release_id: release.id,
      p_status: status,
    });
    setWorking(null);
    if (error) {
      Alert.alert("Não foi possível alterar", error.message);
    } else {
      await load();
    }
  }

  function confirmStatus(release: ReleaseItem, status: "testing" | "paused" | "rolled_back") {
    const messages = {
      testing: "A versão ficará elegível para testes internos. Isto não dispara uma compilação nem libera a atualização para as igrejas.",
      paused: "O aplicativo deixará de oferecer novos downloads desta versão pelo catálogo. Quem já instalou não perderá dados.",
      rolled_back: "Marca esta versão como retirada. O Android não faz downgrade automaticamente; uma correção precisará usar código de versão superior.",
    };
    Alert.alert(
      status === "testing" ? "Iniciar testes?" :
        status === "paused" ? "Pausar distribuição?" : "Retirar esta versão?",
      messages[status],
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Confirmar", onPress: () => void changeStatus(release, status) },
      ],
    );
  }

  const summary = data?.summary;

  if (planningRelease && data) {
    return (
      <PlatformAppDistributionPlanner
        release={planningRelease}
        churches={data.churches.map(({ id, name }) => ({id, name}))}
        onBack={() => setPlanningRelease(null)}
      />
    );
  }

  return (
    <EloScreen
      title="Atualizações"
      eyebrow="PLATAFORMA • ELO"
      subtitle="Versões, APKs exclusivos, testes e situação das igrejas."
      onBack={onBack}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel="Atualizar dados"
          onPress={() => void load()} style={styles.refresh}>
          <P.ArrowsClockwiseIcon size={20} color={eloColors.ink} weight="bold" />
        </Pressable>
      }
    >
      {loading && !data ? (
        <ActivityIndicator style={styles.spinner} size="large" />
      ) : errorMessage ? (
        <EloState title="Central indisponível" description={errorMessage} icon="WarningIcon" />
      ) : data && summary ? (
        <>
          <View style={styles.banner}>
            <P.ShieldCheckIcon size={22} color="#2563A3" weight="duotone" />
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>Publicação protegida</Text>
              <Text style={styles.muted}>
                Esta prévia permite planejar versões e interromper distribuição.
                A liberação em produção exige sua aprovação.
              </Text>
            </View>
          </View>

          <Text style={eloSharedStyles.sectionTitle}>Acompanhamento</Text>
          <View style={styles.metrics}>
            <Metric label="Igrejas com APK" value={summary.churches_with_apk} />
            <Metric label="Na fila" value={summary.queued_builds} />
            <Metric label="Compilando" value={summary.building_builds} />
            <Metric label="Contas reportando" value={summary.accounts_reporting} />
          </View>
          <Text style={styles.footnote}>
            Versões instaladas são informadas pelo app autenticado; não representam confirmação independente de instalação.
          </Text>

          <Text style={eloSharedStyles.sectionTitle}>Gerenciar versões</Text>
          <EloActionButton
            icon={formOpen ? "XIcon" : "PlusIcon"}
            label={formOpen ? "Fechar formulário" : "Cadastrar nova versão"}
            onPress={() => setFormOpen(!formOpen)}
            variant={formOpen ? "secondary" : "primary"}
          />
          {formOpen && (
            <EloCard style={styles.form}>
              <Text style={styles.label}>Ambiente</Text>
              <View style={styles.channelRow}>
                <Chip label="Prévia" selected={channel === "preview"} onPress={() => setChannel("preview")} />
                <Chip label="Produção (rascunho)" selected={channel === "production"}
                  onPress={() => setChannel("production")} />
              </View>
              <Text style={styles.label}>Versão comercial</Text>
              <TextInput accessibilityLabel="Número da versão"
                style={styles.input} value={versionName}
                onChangeText={setVersionName} placeholder="1.0.7"
                autoCapitalize="none" autoCorrect={false} maxLength={30} />
              <Text style={styles.label}>Código Android (crescente)</Text>
              <TextInput accessibilityLabel="Código Android"
                style={styles.input} value={versionCode} onChangeText={setVersionCode}
                keyboardType="number-pad" maxLength={9} />
              <Text style={styles.label}>Versão mínima suportada</Text>
              <TextInput accessibilityLabel="Versão mínima suportada"
                style={styles.input} value={minimumVersion}
                onChangeText={setMinimumVersion} keyboardType="number-pad" maxLength={9} />
              <Text style={styles.label}>Novidades desta versão</Text>
              <TextInput accessibilityLabel="Novidades"
                style={[styles.input, styles.textarea]} value={notes}
                onChangeText={setNotes} placeholder="Ex.: melhorias em cultos e escalas"
                multiline textAlignVertical="top" maxLength={1500} />
              <EloActionButton label="Salvar rascunho" icon="FloppyDiskIcon"
                loading={working === "draft"} disabled={working !== null}
                onPress={confirmDraft} />
              <Text style={styles.footnote}>
                Salvar não gera APK, não aciona Push e não libera atualizações.
              </Text>
            </EloCard>
          )}

          {data.releases.length === 0 ? (
            <EloState title="Nenhuma versão cadastrada"
              description="Comece por um rascunho de versão." icon="PackageIcon" />
          ) : data.releases.map((release) => (
            <EloCard key={release.id} style={styles.release}>
              <View style={styles.spaceBetween}>
                <Text style={styles.releaseTitle}>Elo {release.version_name}</Text>
                <Text style={[styles.badge,
                  release.status === "published" ? styles.successBadge : styles.softBadge]}>
                  {releaseLabels[release.status]}
                </Text>
              </View>
              <Text style={styles.meta}>
                {release.channel === "preview" ? "Prévia" : "Produção"}
                {" • Android "}{release.version_code}{" • "}{fmtDate(release.created_at)}
              </Text>
              {release.release_notes ? <Text style={styles.releaseNotes}>{release.release_notes}</Text> : null}
              <Text style={styles.muted}>
                APKs: {release.ready} prontos • {release.building} compilando • {release.queued} na fila
                {release.failed > 0 ? ` • ${release.failed} com falha` : ""}
              </Text>
              {release.status === "draft" && release.channel === "preview" ? (
                <EloActionButton label="Iniciar testes internos" variant="secondary"
                  onPress={() => confirmStatus(release, "testing")}
                  disabled={working !== null} loading={working === release.id} />
              ) : null}
              {release.status === "testing" || release.status === "published" ? (
                <EloActionButton label="Pausar versão" variant="secondary"
                  onPress={() => confirmStatus(release, "paused")}
                  disabled={working !== null} loading={working === release.id} />
              ) : null}
              {release.status === "paused" ? (
                <View style={styles.controls}>
                  {release.channel === "preview" && (
                    <EloActionButton label="Retomar teste" variant="secondary"
                      onPress={() => confirmStatus(release, "testing")}
                      disabled={working !== null} />
                  )}
                  <EloActionButton label="Retirar versão" variant="danger"
                    onPress={() => confirmStatus(release, "rolled_back")}
                    disabled={working !== null} />
                </View>
              ) : null}
              <EloActionButton
                label="Simular distribuição por igreja"
                icon="ListChecksIcon"
                variant="secondary"
                onPress={() => setPlanningRelease(release)}
              />
              {release.channel === "production" && release.status === "draft" ? (
                <Text style={styles.pending}>Aguardando aprovação para publicação em produção.</Text>
              ) : null}
            </EloCard>
          ))}

          <Text style={eloSharedStyles.sectionTitle}>Igrejas e distribuição</Text>
          <Text style={styles.muted}>
            Situação real dos APKs por igreja. Builds de produção e anúncios em massa permanecem bloqueados nesta etapa.
          </Text>
          {data.churches.map((church) => (
            <EloCard key={church.id} style={styles.church}>
              <View style={styles.spaceBetween}>
                <Text style={styles.churchTitle}>{church.name}</Text>
                {church.is_blessed ? <Text style={styles.blessed}>Abençoada</Text> : null}
              </View>
              <Text style={styles.meta}>
                {church.apk_status ? buildLabels[church.apk_status] ?? church.apk_status :
                  "Sem solicitação de APK"}
                {church.apk_version_code
                  ? ` • Versão ${church.apk_version_name ?? church.apk_version_code}` : ""}
              </Text>
              <Text style={styles.muted}>
                {church.reports_count > 0
                  ? `${church.reports_count} conta(s) com versão informada pelo app`
                  : "Ainda sem confirmação de versão pelo app"}
              </Text>
              {church.reported_version_counts.length > 0 ? (
                <Text style={styles.footnote}>
                  {church.reported_version_counts.map((v) =>
                    `Android ${v.version_code}: ${v.accounts} conta(s)`).join(" • ")}
                </Text>
              ) : null}
            </EloCard>
          ))}
        </>
      ) : null}
    </EloScreen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricNumber}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function Chip({ label, selected, onPress }: {
  label: string; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spinner: { marginVertical: 50 },
  refresh: {
    width: 42, height: 42, borderRadius: 14, borderWidth: 1,
    borderColor: eloColors.line, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
  },
  banner: {
    marginTop: 18, padding: 14, borderRadius: 16, backgroundColor: "#EDF5FC",
    flexDirection: "row", gap: 10, alignItems: "flex-start",
  },
  bannerText: { flex: 1 },
  bannerTitle: { color: "#215580", fontWeight: "900", marginBottom: 4 },
  muted: { color: eloColors.muted, fontSize: 12, lineHeight: 18 },
  metrics: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
  },
  metric: {
    flexBasis: "47%", flexGrow: 1, padding: 14, borderWidth: 1,
    borderColor: eloColors.line, borderRadius: 15, backgroundColor: "#fff",
  },
  metricNumber: { fontSize: 24, fontWeight: "900", color: eloColors.ink },
  footnote: { marginTop: 9, fontSize: 11, lineHeight: 17, color: eloColors.muted },
  form: { marginTop: 12, gap: 9 },
  label: { fontSize: 12, fontWeight: "800", color: eloColors.ink, marginTop: 5 },
  channelRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10,
    borderWidth: 1, borderColor: eloColors.line },
  chipSelected: { borderColor: eloColors.blue, backgroundColor: eloColors.surfaceSoft },
  chipText: { fontSize: 12, color: eloColors.muted, fontWeight: "700" },
  chipTextSelected: { color: eloColors.blue },
  input: { minHeight: 47, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: eloColors.line, backgroundColor: "#fff",
    fontSize: 14, color: eloColors.ink },
  textarea: { minHeight: 90, paddingTop: 12 },
  release: { marginTop: 10, gap: 9 },
  spaceBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  releaseTitle: { fontSize: 16, fontWeight: "900", color: eloColors.ink, flexShrink: 1 },
  badge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 9, overflow: "hidden" },
  softBadge: { backgroundColor: "#EDF5FC", color: eloColors.blue },
  successBadge: { backgroundColor: eloColors.successSoft, color: eloColors.green },
  meta: { fontSize: 12, fontWeight: "700", color: eloColors.muted },
  releaseNotes: { fontSize: 13, lineHeight: 19, color: eloColors.ink },
  pending: { marginTop: 8, fontSize: 11, fontWeight: "700", color: "#9A6700" },
  controls: { gap: 8 },
  church: { marginTop: 10, gap: 5 },
  churchTitle: { fontSize: 15, fontWeight: "800", color: eloColors.ink, flexShrink: 1 },
  blessed: { fontSize: 10, color: "#9A6700", fontWeight: "800" },
});
