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

import { useOrganization } from "../../contexts/OrganizationContext";
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

type Routine = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
};

type CommunionRule = {
  rule_id: string;
  title: string;
  frequency: "monthly" | "annual";
  month_of_year: number | null;
  ordinal: number;
  target_routine_id: string;
  routine_name: string;
  weekday: number;
  start_time: string;
  active: boolean;
};

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const ORDINALS = [
  { value: 1, label: "1º" },
  { value: 2, label: "2º" },
  { value: 3, label: "3º" },
  { value: 4, label: "4º" },
  { value: 5, label: "5º" },
  { value: -1, label: "Último" },
];

function ordinalLabel(value: number) {
  return ORDINALS.find((item) => item.value === value)?.label ?? String(value);
}

function timeLabel(value: string) {
  return value.slice(0, 5);
}

export function CommunionSettingsScreen({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const {
    activeOrganization,
    activeUnit,
  } = useOrganization();

  const [rules, setRules] = useState<CommunionRule[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [frequency, setFrequency] =
    useState<"monthly" | "annual">("monthly");
  const [monthOfYear, setMonthOfYear] = useState(1);
  const [ordinal, setOrdinal] = useState(2);
  const [targetRoutineId, setTargetRoutineId] =
    useState<string | null>(null);
  const [title, setTitle] = useState("Ceia do Senhor");

  const monthlyCount = useMemo(
    () => rules.filter((item) => item.frequency === "monthly").length,
    [rules]
  );

  const annualCount = useMemo(
    () => rules.filter((item) => item.frequency === "annual").length,
    [rules]
  );

  const selectedRoutine = useMemo(
    () => routines.find((item) => item.id === targetRoutineId) ?? null,
    [routines, targetRoutineId]
  );

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [rulesResponse, routinesResponse] = await Promise.all([
        supabase.rpc("list_communion_rules", {
          p_organization_id: activeOrganization.id,
          p_unit_id: activeUnit.id,
        }),
        supabase
          .from("service_routines")
          .select("id,name,weekday,start_time")
          .eq("organization_id", activeOrganization.id)
          .eq("unit_id", activeUnit.id)
          .eq("active", true)
          .order("weekday", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      if (rulesResponse.error) throw rulesResponse.error;
      if (routinesResponse.error) throw routinesResponse.error;

      const nextRoutines = (routinesResponse.data ?? []) as Routine[];
      setRules((rulesResponse.data ?? []) as CommunionRule[]);
      setRoutines(nextRoutines);

      if (!targetRoutineId && nextRoutines.length > 0) {
        setTargetRoutineId(nextRoutines[0].id);
      }
    } catch (error) {
      Alert.alert(
        "Ceia do Senhor",
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a configuração."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit, targetRoutineId]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setFrequency("monthly");
    setMonthOfYear(1);
    setOrdinal(2);
    setTitle("Ceia do Senhor");
    setTargetRoutineId(routines[0]?.id ?? null);
  }

  async function saveRule() {
    if (!activeOrganization || !activeUnit || !targetRoutineId) {
      Alert.alert(
        "Culto base necessário",
        "Escolha qual culto recorrente será transformado em Ceia."
      );
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("save_communion_rule", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_rule_id: null,
        p_title: title.trim() || "Ceia do Senhor",
        p_frequency: frequency,
        p_month_of_year:
          frequency === "annual" ? monthOfYear : null,
        p_ordinal: ordinal,
        p_target_routine_id: targetRoutineId,
      });

      if (error) throw error;

      setShowForm(false);
      resetForm();
      await load();
      await onSaved();
    } catch (error) {
      Alert.alert(
        "Regra não salva",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmArchive(rule: CommunionRule) {
    Alert.alert(
      "Remover regra de Ceia?",
      "Os cultos futuros voltarão ao título normal da rotina e a escala especial da Ceia será removida dessas datas.",
      [
        { text: "Voltar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: () => void archiveRule(rule),
        },
      ]
    );
  }

  async function archiveRule(rule: CommunionRule) {
    if (!activeOrganization || !activeUnit) return;

    try {
      const { error } = await supabase.rpc(
        "archive_communion_rule",
        {
          p_organization_id: activeOrganization.id,
          p_unit_id: activeUnit.id,
          p_rule_id: rule.rule_id,
        }
      );

      if (error) throw error;

      await load();
      await onSaved();
    } catch (error) {
      Alert.alert(
        "Regra não removida",
        error instanceof Error ? error.message : "Tente novamente."
      );
    }
  }

  function ruleSummary(rule: CommunionRule) {
    const when = `${ordinalLabel(rule.ordinal)} ${WEEKDAYS[rule.weekday]}`;

    if (rule.frequency === "annual" && rule.month_of_year) {
      return `${when} de ${MONTHS[rule.month_of_year - 1]}`;
    }

    return `Todo ${when} do mês`;
  }

  return (
    <EloScreen
      title="Ceia do Senhor"
      eyebrow="ELO • CULTOS"
      subtitle="Defina quando a Ceia acontece. O Elo transforma o culto recorrente daquela data sem criar duplicidade."
      onBack={onBack}
    >
      <View style={styles.summaryRow}>
        <EloCard style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{monthlyCount}</Text>
          <Text style={styles.summaryLabel}>
            {monthlyCount === 1 ? "vez por mês" : "vezes por mês"}
          </Text>
        </EloCard>

        <EloCard style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{annualCount}</Text>
          <Text style={styles.summaryLabel}>
            {annualCount === 1 ? "vez por ano" : "vezes por ano"}
          </Text>
        </EloCard>
      </View>

      <View style={styles.infoCard}>
        <P.InfoIcon
          size={18}
          color={eloColors.blue}
          weight="duotone"
        />
        <Text style={styles.infoText}>
          Para ter duas Ceias no mesmo mês, crie duas regras. Ex.: 1º domingo e 3º domingo. Esta configuração define somente as datas; ninguém é escalado aqui.
        </Text>
      </View>

      <View style={styles.primaryAction}>
        <EloActionButton
          label={showForm ? "Fechar configuração" : "Adicionar regra de Ceia"}
          variant={showForm ? "secondary" : "primary"}
          icon={showForm ? "XIcon" : "PlusIcon"}
          onPress={() => setShowForm((value) => !value)}
        />
      </View>

      {showForm ? (
        <EloCard>
          <Text style={eloSharedStyles.cardTitle}>
            Nova regra
          </Text>

          <Text style={styles.label}>Frequência</Text>
          <View style={styles.twoColumns}>
            <Pressable
              onPress={() => setFrequency("monthly")}
              style={[
                styles.choice,
                frequency === "monthly" && styles.choiceSelected,
              ]}
            >
              <Text style={styles.choiceTitle}>Mensal</Text>
              <Text style={styles.choiceMeta}>
                Repete todo mês
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFrequency("annual")}
              style={[
                styles.choice,
                frequency === "annual" && styles.choiceSelected,
              ]}
            >
              <Text style={styles.choiceTitle}>Anual</Text>
              <Text style={styles.choiceMeta}>
                Repete uma vez por ano
              </Text>
            </Pressable>
          </View>

          {frequency === "annual" ? (
            <>
              <Text style={styles.label}>Mês</Text>
              <View style={styles.wrapChoices}>
                {MONTHS.map((month, index) => (
                  <Pressable
                    key={month}
                    onPress={() => setMonthOfYear(index + 1)}
                    style={[
                      styles.smallChoice,
                      monthOfYear === index + 1 &&
                        styles.choiceSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.smallChoiceText,
                        monthOfYear === index + 1 &&
                          styles.smallChoiceTextSelected,
                      ]}
                    >
                      {month.slice(0, 3)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.label}>Culto recorrente que vira Ceia</Text>

          {routines.length === 0 ? (
            <EloState
              title="Nenhum culto recorrente"
              description="Crie primeiro uma rotina na Agenda."
              icon="ArrowsClockwiseIcon"
            />
          ) : (
            <View style={styles.routineList}>
              {routines.map((routine) => {
                const selected = targetRoutineId === routine.id;

                return (
                  <Pressable
                    key={routine.id}
                    onPress={() => setTargetRoutineId(routine.id)}
                    style={[
                      styles.routineChoice,
                      selected && styles.choiceSelected,
                    ]}
                  >
                    <View style={styles.grow}>
                      <Text style={styles.routineTitle}>
                        {routine.name}
                      </Text>
                      <Text style={styles.routineMeta}>
                        {WEEKDAYS[routine.weekday]} •{" "}
                        {timeLabel(routine.start_time)}
                      </Text>
                    </View>

                    {selected ? (
                      <P.CheckCircleIcon
                        size={19}
                        color={eloColors.blue}
                        weight="fill"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.label}>Quando no mês?</Text>
          <View style={styles.wrapChoices}>
            {ORDINALS.map((item) => {
              const selected = ordinal === item.value;

              return (
                <Pressable
                  key={item.value}
                  onPress={() => setOrdinal(item.value)}
                  style={[
                    styles.ordinalChoice,
                    selected && styles.choiceSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.ordinalText,
                      selected && styles.smallChoiceTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedRoutine ? (
            <View style={styles.previewBox}>
              <P.CalendarCheckIcon
                size={18}
                color={eloColors.blue}
                weight="duotone"
              />
              <View style={styles.grow}>
                <Text style={styles.previewTitle}>Resultado</Text>
                <Text style={styles.previewText}>
                  {frequency === "annual"
                    ? `${ordinalLabel(ordinal)} ${WEEKDAYS[selectedRoutine.weekday]} de ${MONTHS[monthOfYear - 1]} • ${timeLabel(selectedRoutine.start_time)}`
                    : `Todo ${ordinalLabel(ordinal)} ${WEEKDAYS[selectedRoutine.weekday]} do mês • ${timeLabel(selectedRoutine.start_time)}`}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>Título do culto</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ceia do Senhor"
            placeholderTextColor="#A1A9B0"
            style={styles.input}
          />

          <View style={styles.formAction}>
            <EloActionButton
              label="Ativar motor de Ceia"
              icon="CheckIcon"
              loading={saving}
              disabled={routines.length === 0}
              onPress={() => void saveRule()}
            />
          </View>
        </EloCard>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>
        Regras ativas
      </Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : rules.length === 0 ? (
        <EloState
          title="Ceia ainda não configurada"
          description="Adicione a primeira regra. O Elo cuidará das próximas datas automaticamente."
          icon="CalendarCheckIcon"
        />
      ) : (
        <View style={styles.ruleList}>
          {rules.map((rule) => (
            <EloCard key={rule.rule_id}>
              <View style={styles.ruleHeader}>
                <View style={styles.ruleIcon}>
                  <P.CalendarCheckIcon
                    size={20}
                    color={eloColors.blue}
                    weight="duotone"
                  />
                </View>

                <View style={styles.grow}>
                  <Text style={eloSharedStyles.cardTitle}>
                    {rule.title}
                  </Text>
                  <Text style={styles.ruleWhen}>
                    {ruleSummary(rule)}
                  </Text>
                  <Text style={styles.ruleRoutine}>
                    {rule.routine_name} • {timeLabel(rule.start_time)}
                  </Text>
                </View>

                <Pressable
                  onPress={() => confirmArchive(rule)}
                  style={styles.removeButton}
                >
                  <P.TrashIcon
                    size={17}
                    color={eloColors.danger}
                    weight="duotone"
                  />
                </Pressable>
              </View>
            </EloCard>
          ))}
        </View>
      )}

      <Text style={eloSharedStyles.sectionTitle}>
        Escala especial
      </Text>

      <EloCard>
        <View style={styles.specialRow}>
          <View style={styles.specialIcon}>
            <P.UsersThreeIcon
              size={22}
              color={eloColors.blue}
              weight="duotone"
            />
          </View>
          <View style={styles.grow}>
            <Text style={eloSharedStyles.cardTitle}>
              Funções da Ceia
            </Text>
            <Text style={eloSharedStyles.cardText}>
              O Elo cria automaticamente as funções “Servir o pão”, “Servir o vinho” e “Preparar a ceia”. Elas ficam disponíveis para você usar quando abrir a escala de uma data específica de Ceia.
            </Text>
          </View>
        </View>
      </EloCard>
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 9,
  },
  summaryCard: {
    flex: 1,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "900",
    color: eloColors.ink,
  },
  summaryLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  infoCard: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#EAF5FB",
  },
  infoText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 16,
    color: "#557084",
  },
  primaryAction: {
    marginTop: 14,
  },
  label: {
    marginTop: 15,
    marginBottom: 7,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  twoColumns: {
    flexDirection: "row",
    gap: 8,
  },
  choice: {
    flex: 1,
    minHeight: 68,
    padding: 11,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  choiceSelected: {
    borderColor: "#8CC5E8",
    backgroundColor: "#F2F9FD",
  },
  choiceTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  choiceMeta: {
    marginTop: 4,
    fontSize: 10,
    color: eloColors.muted,
  },
  wrapChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  smallChoice: {
    minWidth: 62,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  smallChoiceText: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  smallChoiceTextSelected: {
    color: eloColors.blue,
  },
  routineList: {
    gap: 7,
  },
  routineChoice: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  routineTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  routineMeta: {
    marginTop: 3,
    fontSize: 10,
    color: eloColors.muted,
  },
  ordinalChoice: {
    minWidth: 58,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  ordinalText: {
    fontSize: 10,
    fontWeight: "900",
    color: eloColors.muted,
  },
  previewBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#F2F9FD",
  },
  previewTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: eloColors.blue,
  },
  previewText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: eloColors.ink,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: eloColors.ink,
  },
  formAction: {
    marginTop: 16,
  },
  loading: {
    paddingVertical: 34,
    alignItems: "center",
  },
  ruleList: {
    gap: 9,
  },
  ruleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ruleIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  ruleWhen: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.blue,
  },
  ruleRoutine: {
    marginTop: 3,
    fontSize: 10,
    color: eloColors.muted,
  },
  removeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#FFF3F3",
  },
  specialRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  specialIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  grow: {
    flex: 1,
  },
});
