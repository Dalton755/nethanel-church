import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
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
const DEMO_ID = "101212c5-6e81-4915-ae9a-fbde5b42bb04";

export type DistributionRelease = {
  id: string;
  version_name: string;
  version_code: number;
  channel: "preview" | "production";
  status: string;
};

export type DistributionChurch = {
  id: string;
  name: string;
};

type DistributionRow = {
  organization_id: string;
  church_name: string;
  status: string;
  reason: string;
  last_ready_code: number | null;
  last_ready_version: string | null;
  effective_plan_code: string | null;
  in_progress_status: string | null;
};

type SavedDraft = {
  id: string;
  name: string;
  created_at: string;
  status: string;
  organization_count: number;
  organization_ids: string[];
  execution_enabled: false;
};

type PreviewResponse = {
  items: DistributionRow[];
  eligible_for_preflight: number;
  already_prepared: number;
  blocked: number;
  execution_enabled: false;
  requires_owner_approval: true;
};

const statusDisplay: Record<string, { label: string; color: string }> = {
  eligible_for_preflight: { label: "Elegível", color: eloColors.green },
  already_prepared: { label: "APK pronto", color: eloColors.green },
  release_blocked: { label: "Versão suspensa", color: eloColors.danger },
  inactive: { label: "Igreja inativa", color: eloColors.danger },
  demo_only: { label: "Restrita ao Demo", color: eloColors.muted },
  plan_not_eligible: { label: "Plano incompatível", color: eloColors.danger },
  missing_base_apk: { label: "Sem primeiro APK", color: eloColors.muted },
  identity_mismatch: { label: "Revisão necessária", color: eloColors.danger },
  version_not_newer: { label: "Versão não é mais nova", color: eloColors.muted },
  build_in_progress: { label: "Solicitação em andamento", color: eloColors.blue },
};

export function PlatformAppDistributionPlanner({
  release, churches, onBack,
}: {
  release: DistributionRelease;
  churches: DistributionChurch[];
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [draftName, setDraftName] = useState(`Plano Elo ${release.version_name}`);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);

  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    const { data, error } = await supabase.rpc("platform_admin_list_distribution_drafts", {
      p_release_id: release.id,
    });
    if (error) {
      console.warn("Elo: nao foi possivel carregar planejamento", error);
    } else {
      setSavedDrafts((data ?? []) as SavedDraft[]);
    }
    setLoadingSaved(false);
  }, [release.id]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const allowed = useCallback((church: DistributionChurch) =>
    release.channel === "production" || church.id === DEMO_ID,
    [release.channel]
  );

  const selectableChurches = churches.filter(allowed);

  function toggle(church: DistributionChurch) {
    if (!allowed(church)) return;
    setPreview(null);
    setSelected((current) => current.includes(church.id)
      ? current.filter((id) => id !== church.id)
      : [...current, church.id]);
  }

  function toggleAll() {
    setPreview(null);
    const all = selectableChurches.map((church) => church.id);
    setSelected(selected.length === all.length ? [] : all);
  }

  async function simulate() {
    if (selected.length === 0) {
      Alert.alert("Escolha ao menos uma igreja",
        "Selecione as igrejas para analisar a distribuição desta versão.");
      return;
    }
    setSimulating(true);
    const { data, error } = await supabase.rpc(
      "platform_admin_update_distribution_preview", {
        p_release_id: release.id,
        p_organization_ids: selected,
      }
    );
    setSimulating(false);
    if (error) {
      setPreview(null);
      Alert.alert("Não foi possível simular", error.message);
      return;
    }
    setPreview(data as PreviewResponse);
  }

  async function saveDraft() {
    if (!preview || selected.length===0 ||
        (release.status !== "draft" && release.status !== "testing")) return;
    if (draftName.trim().length < 3 || draftName.trim().length > 100) {
      Alert.alert("Nome inválido", "Use um nome entre 3 e 100 caracteres.");
      return;
    }
    setSavingDraft(true);
    const { error } = await supabase.rpc("platform_admin_save_distribution_draft", {
      p_release_id: release.id,
      p_name: draftName.trim(),
      p_organization_ids: selected,
    });
    setSavingDraft(false);
    if (error) {
      Alert.alert("Não foi possível salvar", error.message);
      return;
    }
    await loadSaved();
    Alert.alert("Planejamento salvo",
      "Somente o rascunho foi salvo. Nenhuma atualização foi enviada ou compilada.");
  }

  function confirmSaveDraft() {
    if (savingDraft) return;
    Alert.alert("Salvar planejamento?",
      `Versão Elo ${release.version_name}: ${selected.length} igreja(s). Isso não autoriza nenhuma publicação nem gera APK.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Salvar rascunho", onPress: () => void saveDraft() },
      ]);
  }

  return (
    <EloScreen
      title="Distribuição"
      eyebrow="PLATAFORMA • SIMULAÇÃO"
      subtitle={`Versão Elo ${release.version_name} • Android ${release.version_code}`}
      onBack={onBack}
    >
      <View style={styles.safety}>
        <P.ShieldCheckIcon size={21} color={eloColors.blue} weight="duotone" />
        <View style={styles.safetyText}>
          <Text style={styles.safetyTitle}>Planejamento seguro</Text>
          <Text style={styles.muted}>
            Esta tela apenas consulta as condições das igrejas.
            Não gera APK, não cria solicitações, não envia Push e não publica versões.
          </Text>
        </View>
      </View>

      <Text style={eloSharedStyles.sectionTitle}>Escolher destinatárias</Text>
      <View style={styles.row}>
        <Text style={styles.hint}>{selected.length} selecionada(s)</Text>
        <Pressable accessibilityRole="button" onPress={toggleAll}
          style={styles.linkButton}>
          <Text style={styles.linkText}>
            {selected.length === selectableChurches.length && selected.length > 0
              ? "Limpar" : "Selecionar todas"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.churchList}>
        {churches.map((church) => {
          const enabled = allowed(church);
          const isSelected = selected.includes(church.id);
          return (
            <Pressable key={church.id} accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled: !enabled }}
              disabled={!enabled}
              onPress={() => toggle(church)}
              style={({ pressed }) => [
                styles.churchRow, !enabled && styles.disabled,
                isSelected && styles.selectedChurch, pressed && styles.pressed,
              ]}>
              <View style={[styles.checkBox, isSelected && styles.checkedBox]}>
                {isSelected && <P.CheckIcon size={14} color="#FFFFFF" weight="bold" />}
              </View>
              <View style={styles.churchText}>
                <Text style={styles.churchName}>{church.name}</Text>
                {!enabled && (
                  <Text style={styles.muted}>Prévia disponível apenas ao Elo Church Demo</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {release.channel === "production" && release.status !== "published" ? (
        <Text style={styles.warning}>
          Esta versão não foi publicada. A simulação não autoriza produção.
        </Text>
      ) : null}

      <View style={styles.simulateButton}>
        <EloActionButton label="Simular distribuição" icon="MagnifyingGlassIcon"
          loading={simulating} disabled={selected.length===0 || simulating}
          onPress={() => void simulate()} />
      </View>

      {preview ? (
        <>
          <Text style={eloSharedStyles.sectionTitle}>Diagnóstico da seleção</Text>
          <View style={styles.metrics}>
            <Metric label="Para validar" count={preview.eligible_for_preflight} />
            <Metric label="APK já pronto" count={preview.already_prepared} />
            <Metric label="Com impedimento" count={preview.blocked} />
          </View>
          <Text style={styles.disclaimer}>
            Elegível significa apenas que a igreja pode avançar à verificação
            de assinatura e versão. Não significa APK gerado ou atualização entregue.
          </Text>
          {preview.items.length === 0 ? (
            <EloState title="Nenhuma igreja retornada"
              description="Confira a seleção e tente novamente."
              icon="InfoIcon" />
          ) : preview.items.map((item) => {
            const badge = statusDisplay[item.status] ?? {
              label: item.status, color: eloColors.muted,
            };
            return (
              <EloCard key={item.organization_id} style={styles.result}>
                <Text style={styles.resultChurch}>{item.church_name}</Text>
                <Text style={[styles.status, {color: badge.color}]}>
                  {badge.label}
                </Text>
                <Text style={styles.muted}>{item.reason}</Text>
                <Text style={styles.version}>
                  Último APK: {item.last_ready_version ??
                    (item.last_ready_code ? String(item.last_ready_code) : "versão legada ou não gerado")}
                  {" • Plano: "}{item.effective_plan_code ?? "—"}
                </Text>
              </EloCard>
            );
          })}
          {release.status === "draft" || release.status === "testing" ? (
            <EloCard style={styles.saveSection}>
              <Text style={styles.saveTitle}>Guardar este planejamento</Text>
              <Text style={styles.muted}>
                Salve a seleção para continuar depois. Nenhum APK será gerado.
              </Text>
              <TextInput
                accessibilityLabel="Nome do plano de distribuição"
                style={styles.nameInput}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Ex.: Teste inicial"
                maxLength={100}
              />
              <EloActionButton
                label="Salvar planejamento"
                icon="FloppyDiskIcon"
                loading={savingDraft}
                disabled={savingDraft}
                onPress={confirmSaveDraft}
              />
            </EloCard>
          ) : null}
          <View style={styles.finalNote}>
            <P.LockKeyIcon size={18} color="#8A5B00" weight="duotone" />
            <Text style={styles.finalText}>
              Execução bloqueada nesta etapa. A geração e distribuição só serão
              habilitadas após aprovação explícita e testes por igreja.
            </Text>
          </View>
        </>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>Planejamentos salvos</Text>
      {loadingSaved ? (
        <ActivityIndicator color={eloColors.blue} />
      ) : savedDrafts.length === 0 ? (
        <Text style={styles.muted}>
          Nenhuma seleção salva para esta versão.
        </Text>
      ) : savedDrafts.map((item) => (
        <EloCard key={item.id} style={styles.savedItem}>
          <Text style={styles.saveTitle}>{item.name}</Text>
          <Text style={styles.muted}>
            {item.organization_count} igreja(s) • Rascunho • Não executado
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSelected(item.organization_ids.filter(id =>
                selectableChurches.some(church => church.id === id)));
              setPreview(null);
            }}
            style={styles.restoreButton}
          >
            <P.ArrowCounterClockwiseIcon size={17} color={eloColors.blue} />
            <Text style={styles.restoreLabel}>Recarregar seleção</Text>
          </Pressable>
        </EloCard>
      ))}
    </EloScreen>
  );
}

function Metric({label,count}:{label:string;count:number}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{count}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safety: {
    marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: "#EDF5FC",
    flexDirection: "row", alignItems: "flex-start", gap: 10,
  },
  safetyText: { flex: 1 },
  safetyTitle: { fontSize: 14, fontWeight: "900", color: "#215580", marginBottom: 4 },
  muted: { fontSize: 12, color: eloColors.muted, lineHeight: 18 },
  row: {
    minHeight: 40, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  hint: { fontSize: 12, fontWeight: "700", color: eloColors.muted },
  linkButton: { paddingVertical: 10, paddingHorizontal: 4 },
  linkText: { color: eloColors.blue, fontSize: 12, fontWeight: "800" },
  churchList: { gap: 9 },
  churchRow: {
    minHeight: 57, borderRadius: 15, padding: 13,
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderWidth: 1, borderColor: eloColors.line,
  },
  selectedChurch: { borderColor: eloColors.blue, backgroundColor: "#F4FAFE" },
  checkBox: {
    height: 22, width: 22, borderRadius: 7, borderWidth: 1.5,
    borderColor: "#C0CCD8", alignItems: "center", justifyContent: "center",
  },
  checkedBox: { borderColor: eloColors.blue, backgroundColor: eloColors.blue },
  churchText: { flex: 1 },
  churchName: { fontSize: 14, fontWeight: "800", color: eloColors.ink },
  disabled: { opacity: 0.47 },
  pressed: { opacity: 0.76 },
  simulateButton: { marginTop: 18 },
  warning: {
    fontSize: 12, lineHeight: 19, color: "#9A6700", marginTop: 14,
    padding: 12, backgroundColor: "#FFF7E3", borderRadius: 12,
  },
  metrics: { flexDirection: "row", gap: 7 },
  metric: {
    flex: 1, padding: 12, borderWidth: 1, borderColor: eloColors.line,
    borderRadius: 13, backgroundColor: "#fff",
  },
  metricValue: { fontSize: 22, fontWeight: "900", color: eloColors.ink },
  disclaimer: { fontSize: 11, lineHeight: 17, color: eloColors.muted, marginVertical: 12 },
  result: { marginTop: 9, gap: 6 },
  resultChurch: { fontSize: 15, color: eloColors.ink, fontWeight: "900" },
  status: { fontSize: 11, fontWeight: "800" },
  version: { fontSize: 11, color: eloColors.muted },
  finalNote: {
    marginTop: 18, padding: 14, borderRadius: 16, backgroundColor: "#FFF7E3",
    flexDirection: "row", gap: 10,
  },
  finalText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#8A5B00" },
  saveSection: { marginTop: 16, gap: 11 },
  saveTitle: { fontSize: 14, fontWeight: "900", color: eloColors.ink },
  nameInput: {
    minHeight: 46, borderColor: eloColors.line, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, backgroundColor: "#FFFFFF",
    fontSize: 14, color: eloColors.ink,
  },
  savedItem: { marginTop: 9, gap: 7 },
  restoreButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9 },
  restoreLabel: { fontSize: 12, fontWeight: "800", color: eloColors.blue },
});
