import { useCallback, useEffect, useMemo, useState } from "react";
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
  eloColors,
  eloSharedStyles,
} from "../elo/EloUi";

const P = Phosphor as any;

type SchedulePreset = { name: string; required_count: number };
type DepartmentPreset = {
  key: string;
  name: string;
  category: string;
  functions: SchedulePreset[];
};
type DepartmentSelection = { key: string; name: string; estimated_people: string };
type Ministry = { key: string; name: string };

export type ChurchStructureConfig = {
  configured: boolean;
  estimated_members: number | null;
  ministry_scope: "local" | "congregations" | "regional" | "missions";
  departments: Array<{ key: string; name: string; estimated_people: number }>;
  ministries: Ministry[];
};

export const DEPARTMENT_PRESETS: DepartmentPreset[] = [
  { key: "louvor", name: "Louvor e adoração", category: "Cultos", functions: [
    { name: "Voz", required_count: 4 }, { name: "Bateria", required_count: 1 },
    { name: "Teclado", required_count: 1 }, { name: "Violão", required_count: 1 },
  ] },
  { key: "recepcao", name: "Recepção", category: "Cultos", functions: [
    { name: "Recepcionista", required_count: 2 }, { name: "Visitantes", required_count: 1 },
  ] },
  { key: "portaria", name: "Portaria", category: "Cultos", functions: [
    { name: "Porteiro", required_count: 2 },
  ] },
  { key: "intercessao", name: "Intercessão", category: "Cultos", functions: [
    { name: "Intercessor", required_count: 4 },
  ] },
  { key: "diaconato", name: "Diaconato", category: "Cultos", functions: [
    { name: "Apoio ao culto", required_count: 2 },
    { name: "Recolher ofertas", required_count: 2 },
    { name: "Maquininha", required_count: 1 },
  ] },
  { key: "santa_ceia", name: "Santa Ceia", category: "Cultos", functions: [
    { name: "Preparar a Ceia", required_count: 2 },
    { name: "Servir o pão", required_count: 2 },
    { name: "Servir o vinho", required_count: 2 },
  ] },
  { key: "midia", name: "Mídia e transmissão", category: "Cultos", functions: [
    { name: "Projeção", required_count: 2 },
    { name: "Fotografia", required_count: 2 },
    { name: "Transmissão", required_count: 1 },
  ] },
  { key: "sonoplastia", name: "Sonoplastia", category: "Cultos", functions: [
    { name: "Operador de áudio", required_count: 1 },
  ] },
  { key: "infantil", name: "Ministério infantil / Elo Kids", category: "Ensino", functions: [
    { name: "Professor", required_count: 1 },
    { name: "Auxiliar", required_count: 2 },
    { name: "Check-in e retirada", required_count: 1 },
  ] },
  { key: "ebd", name: "Escola Bíblica Dominical", category: "Ensino", functions: [
    { name: "Professor", required_count: 1 },
    { name: "Auxiliar", required_count: 1 },
  ] },
  { key: "jovens", name: "Jovens", category: "Ensino", functions: [
    { name: "Líder", required_count: 1 }, { name: "Apoio", required_count: 2 },
  ] },
  { key: "adolescentes", name: "Adolescentes", category: "Ensino", functions: [
    { name: "Líder", required_count: 1 }, { name: "Apoio", required_count: 1 },
  ] },
  { key: "mulheres", name: "Mulheres / Círculo de oração", category: "Comunidade", functions: [
    { name: "Coordenação", required_count: 1 }, { name: "Apoio", required_count: 2 },
  ] },
  { key: "homens", name: "Homens", category: "Comunidade", functions: [
    { name: "Coordenação", required_count: 1 }, { name: "Apoio", required_count: 1 },
  ] },
  { key: "casais", name: "Casais e família", category: "Comunidade", functions: [
    { name: "Coordenação", required_count: 1 }, { name: "Apoio", required_count: 1 },
  ] },
  { key: "evangelismo", name: "Evangelismo", category: "Missão e cuidado", functions: [
    { name: "Evangelista", required_count: 2 },
  ] },
  { key: "missoes", name: "Missões", category: "Missão e cuidado", functions: [
    { name: "Equipe de missões", required_count: 2 },
  ] },
  { key: "acao_social", name: "Ação social", category: "Missão e cuidado", functions: [
    { name: "Acolhimento", required_count: 2 },
  ] },
  { key: "visitacao", name: "Visitação", category: "Missão e cuidado", functions: [
    { name: "Equipe de visitas", required_count: 2 },
  ] },
  { key: "estacionamento", name: "Estacionamento e segurança", category: "Apoio", functions: [
    { name: "Estacionamento", required_count: 1 },
    { name: "Segurança", required_count: 1 },
  ] },
  { key: "limpeza", name: "Limpeza e organização", category: "Apoio", functions: [
    { name: "Organização", required_count: 2 },
  ] },
  { key: "comunicacao", name: "Comunicação", category: "Apoio", functions: [
    { name: "Redes sociais", required_count: 1 },
    { name: "Divulgação", required_count: 1 },
  ] },
  { key: "eventos", name: "Eventos", category: "Apoio", functions: [
    { name: "Organização", required_count: 2 },
  ] },
  { key: "tesouraria", name: "Tesouraria", category: "Apoio", functions: [
    { name: "Contagem de ofertas", required_count: 2 },
  ] },
];

const MINISTRY_PRESETS: Ministry[] = [
  { key: "pastor_presidente", name: "Pastor presidente" },
  { key: "pastor_titular", name: "Pastor titular / dirigente" },
  { key: "pastor_auxiliar", name: "Pastor auxiliar" },
  { key: "bispo", name: "Bispo" },
  { key: "apostolo", name: "Apóstolo" },
  { key: "missionario", name: "Missionário(a)" },
  { key: "evangelista", name: "Evangelista" },
  { key: "presbitero", name: "Presbítero" },
  { key: "diacono", name: "Diácono / diaconisa" },
  { key: "cooperador", name: "Cooperador(a)" },
  { key: "obreiro", name: "Obreiro(a)" },
  { key: "seminarista", name: "Seminarista" },
];

const SCOPES = [
  { key: "local", label: "Igreja local", description: "Uma igreja, uma equipe" },
  { key: "congregations", label: "Sede e congregações", description: "Mais de uma unidade" },
  { key: "regional", label: "Campo ou região", description: "Supervisão ministerial" },
  { key: "missions", label: "Missões e frentes", description: "Atuação missionária" },
] as const;

function toKey(name: string, prefix: string) {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return slug ? prefix + slug : "";
}

type Props = {
  organizationId: string;
  unitId: string;
  onBack: () => void;
  onCompleted: () => void | Promise<void>;
  initialSetup?: boolean;
};

export function ChurchStructureScreen({
  organizationId, unitId, onBack, onCompleted, initialSetup = false,
}: Props) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [estimatedMembers, setEstimatedMembers] = useState("");
  const [scope, setScope] = useState<ChurchStructureConfig["ministry_scope"]>("local");
  const [selectedDepartments, setSelectedDepartments] =
    useState<Record<string, DepartmentSelection>>({});
  const [selectedMinistries, setSelectedMinistries] =
    useState<Record<string, Ministry>>({});
  const [newDepartment, setNewDepartment] = useState("");
  const [newMinistry, setNewMinistry] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_church_structure", {
        p_organization_id: organizationId, p_unit_id: unitId,
      });
      if (error) throw error;
      const config = data as ChurchStructureConfig | null;
      if (config?.configured) {
        setEstimatedMembers(config.estimated_members == null
          ? "" : String(config.estimated_members));
        setScope(config.ministry_scope);
        setSelectedDepartments(Object.fromEntries(
          config.departments.map((d) => [d.key, {
            key: d.key, name: d.name,
            estimated_people: String(d.estimated_people ?? 0),
          }])
        ));
        setSelectedMinistries(Object.fromEntries(
          config.ministries.map((m) => [m.key, m])
        ));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message
        : "Não foi possível carregar a estrutura.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, unitId]);

  useEffect(() => { void load(); }, [load]);

  const selectedCount = Object.keys(selectedDepartments).length;
  const ministryCount = Object.keys(selectedMinistries).length;
  const grouped = useMemo(() => {
    const filtered = DEPARTMENT_PRESETS.filter((item) =>
      item.name.toLowerCase().includes(search.trim().toLowerCase())
    );
    return [...new Set(filtered.map((d) => d.category))].map((category) => ({
      category, items: filtered.filter((d) => d.category === category),
    }));
  }, [search]);

  function toggleDepartment(item: DepartmentPreset | DepartmentSelection) {
    setSelectedDepartments((current) => {
      const next = { ...current };
      if (next[item.key]) delete next[item.key];
      else next[item.key] = { key: item.key, name: item.name, estimated_people: "0" };
      return next;
    });
  }

  function addDepartment() {
    const name = newDepartment.trim();
    if (name.length < 2) return;
    const key = toKey(name, "custom_");
    if (key) {
      setSelectedDepartments((current) => ({
        ...current, [key]: { key, name, estimated_people: current[key]?.estimated_people ?? "0" },
      }));
      setNewDepartment("");
    }
  }

  function addMinistry() {
    const name = newMinistry.trim();
    if (name.length < 2) return;
    const key = toKey(name, "custom_");
    if (key) {
      setSelectedMinistries((current) => ({ ...current, [key]: { key, name } }));
      setNewMinistry("");
    }
  }

  function next() {
    setErrorMessage(null);
    if (step === 0) {
      if (estimatedMembers.trim() &&
        (!/^\d+$/.test(estimatedMembers) || Number(estimatedMembers) > 1000000)) {
        setErrorMessage("Informe uma quantidade válida de membros.");
        return;
      }
    }
    setStep((value) => Math.min(2, value + 1));
  }

  async function save() {
    setSaving(true);
    setErrorMessage(null);
    try {
      const departments = Object.values(selectedDepartments).map((item) => {
        const preset = DEPARTMENT_PRESETS.find((d) => d.key === item.key);
        const quantity = Number(item.estimated_people || "0");
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) {
          throw new Error("Confira a quantidade de pessoas em " + item.name);
        }
        return {
          key: item.key, name: item.name, estimated_people: quantity,
          functions: preset?.functions ?? [{ name: "Voluntário", required_count: 1 }],
        };
      });
      const { error } = await supabase.rpc("save_church_structure", {
        p_organization_id: organizationId,
        p_unit_id: unitId,
        p_estimated_members: estimatedMembers.trim() ? Number(estimatedMembers) : null,
        p_ministry_scope: scope,
        p_departments: departments,
        p_ministries: Object.values(selectedMinistries),
      });
      if (error) throw error;
      await onCompleted();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message
        : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <EloScreen
      title="Estrutura da igreja"
      eyebrow={initialSetup ? "BEM-VINDO • PASSO A PASSO" : "ADMINISTRAÇÃO • PERSONALIZAÇÃO"}
      subtitle="Ative somente o que existe na sua igreja. Você pode ajustar tudo depois, em qualquer plano."
      onBack={step > 0 ? () => setStep((value) => value - 1) : onBack}
    >
      <View style={styles.progress}>
        {["Departamentos", "Ministérios", "Concluir"].map((label, index) => (
          <View key={label} style={styles.progressItem}>
            <View style={[styles.progressDot, index <= step && styles.progressDotActive]}>
              <Text style={[styles.progressNumber, index <= step && styles.progressNumberActive]}>
                {index + 1}
              </Text>
            </View>
            <Text style={[styles.progressLabel, index === step && styles.progressLabelActive]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator size="large" /></View> : (
        <>
          {step === 0 ? (
            <>
              <Text style={eloSharedStyles.sectionTitle}>Como é sua igreja?</Text>
              <EloCard>
                <Text style={styles.label}>Quantos membros a igreja tem, aproximadamente?</Text>
                <TextInput
                  value={estimatedMembers}
                  onChangeText={(v) => setEstimatedMembers(v.replace(/\D/g, ""))}
                  placeholder="Ex.: 120 • opcional"
                  placeholderTextColor="#98A1AA"
                  keyboardType="number-pad"
                  style={styles.input}
                />
                <Text style={styles.helper}>
                  Isso ajuda no planejamento. Não cria cadastros fictícios.
                </Text>
              </EloCard>

              <View style={styles.headingRow}>
                <Text style={eloSharedStyles.sectionTitle}>Quais departamentos existem?</Text>
                <Text style={styles.counter}>{selectedCount} ativos</Text>
              </View>
              <Text style={styles.helper}>
                Marque os departamentos da igreja e informe quantas pessoas, em média, participam de cada equipe.
              </Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar departamento..."
                placeholderTextColor="#98A1AA"
                style={[styles.input, styles.search]}
              />
              {grouped.map((group) => (
                <View key={group.category}>
                  <Text style={styles.category}>{group.category}</Text>
                  {group.items.map((item) => {
                    const selected = selectedDepartments[item.key];
                    return (
                      <View key={item.key} style={styles.choiceCard}>
                        <Pressable
                          onPress={() => toggleDepartment(item)}
                          style={styles.choiceRow}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: Boolean(selected) }}
                          accessibilityLabel={item.name}
                        >
                          {selected ? (
                            <P.CheckSquareIcon color={eloColors.blue} size={23} weight="fill" />
                          ) : (
                            <P.SquareIcon color={eloColors.muted} size={23} />
                          )}
                          <Text style={styles.choiceText}>{item.name}</Text>
                        </Pressable>
                        {selected ? (
                          <View style={styles.quantityRow}>
                            <Text style={styles.quantityLabel}>Pessoas na equipe (estimativa)</Text>
                            <TextInput
                              value={selected.estimated_people}
                              onChangeText={(v) => setSelectedDepartments((current) => ({
                                ...current,
                                [item.key]: { ...current[item.key], estimated_people: v.replace(/\D/g, "") },
                              }))}
                              keyboardType="number-pad"
                              selectTextOnFocus
                              style={styles.quantityInput}
                            />
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}

              {Object.values(selectedDepartments).filter((item) => item.key.startsWith("custom_"))
                .map((item) => (
                  <View key={item.key} style={styles.choiceCard}>
                    <Pressable onPress={() => toggleDepartment(item)} style={styles.choiceRow}>
                      <P.CheckSquareIcon color={eloColors.blue} size={23} weight="fill" />
                      <Text style={styles.choiceText}>{item.name}</Text>
                      <Text style={styles.remove}>Remover</Text>
                    </Pressable>
                    <View style={styles.quantityRow}>
                      <Text style={styles.quantityLabel}>Pessoas na equipe</Text>
                      <TextInput
                        value={item.estimated_people}
                        keyboardType="number-pad"
                        onChangeText={(v) => setSelectedDepartments((current) => ({
                          ...current, [item.key]: {
                            ...current[item.key], estimated_people: v.replace(/\D/g, ""),
                          },
                        }))}
                        style={styles.quantityInput}
                      />
                    </View>
                  </View>
                ))}
              <View style={styles.addRow}>
                <TextInput
                  value={newDepartment}
                  onChangeText={setNewDepartment}
                  placeholder="Outro departamento..."
                  placeholderTextColor="#98A1AA"
                  style={[styles.input, styles.grow]}
                />
                <Pressable onPress={addDepartment} style={styles.addButton}>
                  <P.PlusIcon size={20} color="#fff" />
                </Pressable>
              </View>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Text style={eloSharedStyles.sectionTitle}>Qual é o alcance ministerial?</Text>
              {SCOPES.map((item) => (
                <Pressable
                  key={item.key}
                  style={[styles.scopeCard, scope === item.key && styles.selectedCard]}
                  onPress={() => setScope(item.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: scope === item.key }}
                >
                  {scope === item.key ? (
                    <P.RadioButtonIcon size={23} color={eloColors.blue} weight="fill" />
                  ) : (
                    <P.CircleIcon size={23} color={eloColors.muted} />
                  )}
                  <View style={styles.grow}>
                    <Text style={styles.choiceText}>{item.label}</Text>
                    <Text style={styles.helper}>{item.description}</Text>
                  </View>
                </Pressable>
              ))}

              <View style={styles.headingRow}>
                <Text style={eloSharedStyles.sectionTitle}>Quais cargos ministeriais são usados?</Text>
                <Text style={styles.counter}>{ministryCount}</Text>
              </View>
              <Text style={styles.helper}>
                Selecione apenas os títulos adotados pela sua igreja. Eles não concedem permissões automáticas.
              </Text>
              {MINISTRY_PRESETS.map((item) => {
                const selected = Boolean(selectedMinistries[item.key]);
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setSelectedMinistries((current) => {
                      const next = { ...current };
                      if (next[item.key]) delete next[item.key];
                      else next[item.key] = item;
                      return next;
                    })}
                    style={[styles.choiceCard, styles.choiceRow]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    {selected ? <P.CheckSquareIcon size={23} color={eloColors.blue} weight="fill" />
                      : <P.SquareIcon size={23} color={eloColors.muted} />}
                    <Text style={styles.choiceText}>{item.name}</Text>
                  </Pressable>
                );
              })}
              {Object.values(selectedMinistries).filter((m) => m.key.startsWith("custom_"))
                .map((item) => (
                  <Pressable
                    key={item.key}
                    style={[styles.choiceCard, styles.choiceRow]}
                    onPress={() => setSelectedMinistries((current) => {
                      const next = { ...current }; delete next[item.key]; return next;
                    })}
                  >
                    <P.CheckSquareIcon size={23} color={eloColors.blue} weight="fill" />
                    <Text style={styles.choiceText}>{item.name}</Text>
                    <Text style={styles.remove}>Remover</Text>
                  </Pressable>
                ))}
              <View style={styles.addRow}>
                <TextInput
                  value={newMinistry}
                  onChangeText={setNewMinistry}
                  placeholder="Outro cargo ministerial..."
                  placeholderTextColor="#98A1AA"
                  style={[styles.input, styles.grow]}
                />
                <Pressable onPress={addMinistry} style={styles.addButton}>
                  <P.PlusIcon size={20} color="#fff" />
                </Pressable>
              </View>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={eloSharedStyles.sectionTitle}>Seu Elo está quase pronto</Text>
              <EloCard>
                <Text style={styles.summaryNumber}>{selectedCount}</Text>
                <Text style={eloSharedStyles.cardTitle}>Departamentos selecionados</Text>
                <Text style={styles.helper}>
                  {Object.values(selectedDepartments).map((d) => d.name).join(" • ") || "Nenhum por enquanto"}
                </Text>
                <View style={styles.divider} />
                <Text style={styles.summaryNumber}>{ministryCount}</Text>
                <Text style={eloSharedStyles.cardTitle}>Cargos ministeriais</Text>
                <Text style={styles.helper}>
                  {Object.values(selectedMinistries).map((m) => m.name).join(" • ") || "Nenhum por enquanto"}
                </Text>
              </EloCard>
              <EloCard>
                <P.CalendarCheckIcon size={26} color={eloColors.blue} weight="duotone" />
                <Text style={[eloSharedStyles.cardTitle, styles.cardTop]}>
                  Escalas preparadas automaticamente
                </Text>
                <Text style={styles.helper}>
                  As equipes selecionadas serão criadas com funções e quantidades padrão.
                  Em cada culto, a liderança poderá aplicar o modelo da igreja em um toque.
                  Pessoas reais e escalas de cada data serão definidas depois.
                </Text>
              </EloCard>
              <Text style={styles.helper}>
                Todas as configurações estruturais estão disponíveis em todos os planos.
                Você poderá editá-las em Meu Elo → Administração → Estrutura da igreja.
              </Text>
            </>
          ) : null}

          {errorMessage ? <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View> : null}

          <View style={styles.actions}>
            <EloActionButton
              label={step === 2 ? "Salvar e abrir meu Elo" : "Continuar"}
              icon={step === 2 ? "CheckCircleIcon" : "ArrowRightIcon"}
              loading={saving}
              onPress={() => { if (step === 2) void save(); else next(); }}
            />
            {step > 0 ? <EloActionButton
              label="Voltar à etapa anterior"
              variant="secondary"
              onPress={() => setStep((value) => value - 1)}
            /> : null}
          </View>
        </>
      )}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", justifyContent: "space-between", marginTop: 18, marginBottom: 14 },
  progressItem: { flex: 1, alignItems: "center", gap: 6 },
  progressDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#E7EDF2", alignItems: "center", justifyContent: "center" },
  progressDotActive: { backgroundColor: eloColors.blue },
  progressNumber: { fontSize: 13, fontWeight: "800", color: eloColors.muted },
  progressNumberActive: { color: "#FFFFFF" },
  progressLabel: { fontSize: 11, color: eloColors.muted },
  progressLabelActive: { color: eloColors.ink, fontWeight: "800" },
  headingRow: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  counter: { color: eloColors.blue, fontSize: 12, fontWeight: "800" },
  label: { color: eloColors.ink, fontSize: 14, fontWeight: "700", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: eloColors.line, borderRadius: 12, minHeight: 48,
    paddingHorizontal: 13, backgroundColor: "#FFFFFF", fontSize: 15, color: eloColors.ink },
  helper: { fontSize: 12, lineHeight: 19, color: eloColors.muted, marginTop: 6, marginBottom: 8 },
  category: { marginTop: 18, marginBottom: 6, fontSize: 12, fontWeight: "900", color: eloColors.muted, textTransform: "uppercase" },
  search: { marginTop: 12 },
  choiceCard: { borderWidth: 1, borderColor: eloColors.line, borderRadius: 14,
    backgroundColor: "#FFFFFF", marginTop: 8, overflow: "hidden" },
  choiceRow: { minHeight: 52, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row",
    alignItems: "center", gap: 11 },
  choiceText: { flex: 1, fontSize: 14, fontWeight: "700", color: eloColors.ink },
  quantityRow: { borderTopWidth: 1, borderTopColor: eloColors.line, paddingHorizontal: 14,
    paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  quantityLabel: { flex: 1, fontSize: 11, color: eloColors.muted },
  quantityInput: { width: 76, minHeight: 39, borderWidth: 1, borderColor: eloColors.line,
    borderRadius: 10, textAlign: "center", fontSize: 15, fontWeight: "800", color: eloColors.ink },
  addRow: { flexDirection: "row", gap: 9, marginTop: 16, marginBottom: 10 },
  grow: { flex: 1 },
  addButton: { width: 48, height: 48, borderRadius: 12, backgroundColor: eloColors.blue,
    alignItems: "center", justifyContent: "center" },
  scopeCard: { flexDirection: "row", gap: 12, alignItems: "center", padding: 14,
    borderRadius: 14, borderWidth: 1, borderColor: eloColors.line,
    backgroundColor: "#FFFFFF", marginTop: 9 },
  selectedCard: { borderColor: eloColors.blue, backgroundColor: "#F0F8FD" },
  remove: { fontSize: 11, color: eloColors.danger },
  summaryNumber: { marginTop: 8, fontSize: 28, fontWeight: "900", color: eloColors.blue },
  divider: { height: 1, backgroundColor: eloColors.line, marginVertical: 14 },
  cardTop: { marginTop: 10 },
  actions: { marginTop: 22, marginBottom: 30, gap: 8 },
  errorBox: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: eloColors.dangerSoft },
  errorText: { color: eloColors.danger, fontSize: 13 },
  loading: { paddingVertical: 70, alignItems: "center" },
});
