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
import type { ServiceEditorData } from "./NewServiceScreen";

const P = Phosphor as any;

type Department = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
};

type DepartmentFunction = {
  function_id: string;
  function_name: string;
  default_required_count: number;
  sort_order: number;
  active: boolean;
  qualified_member_count: number;
};

type EventRule = {
  id: string;
  department_id: string;
  department_function_id: string | null;
  role_label: string;
  required_count: number;
  rotation_mode: "balanced" | "fixed";
  min_rest_days: number;
};

type EventAssignment = {
  assignment_id: string;
  rule_id: string | null;
  department_id: string;
  department_name: string;
  person_id: string;
  person_name: string;
  role_label: string;
  status: string;
  source: string;
  starts_at: string;
  ends_at: string | null;
  event_title: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(value: string) {
  switch (value) {
    case "confirmed":
      return "Confirmado";
    case "replacement_requested":
      return "Substituição";
    case "declined":
      return "Recusado";
    case "completed":
      return "Concluído";
    default:
      return "Aguardando";
  }
}

export function ServiceScheduleScreen({
  service,
  onBack,
}: {
  service: ServiceEditorData;
  onBack: () => void;
}) {
  const {
    activeOrganization,
    activeUnit,
    can,
    canAtOrganization,
  } = useOrganization();

  const canManage =
    can("schedules.manage") ||
    canAtOrganization("schedules.manage");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [functions, setFunctions] = useState<DepartmentFunction[]>([]);
  const [rules, setRules] = useState<EventRule[]>([]);
  const [assignments, setAssignments] = useState<EventAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFunctions, setLoadingFunctions] = useState(false);
  const [isCommunion, setIsCommunion] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] =
    useState<string | null>(null);
  const [selectedFunctionId, setSelectedFunctionId] =
    useState<string | null>(null);
  const [requiredCount, setRequiredCount] = useState("1");
  const [rotationMode, setRotationMode] =
    useState<"balanced" | "fixed">("balanced");
  const [minRestDays, setMinRestDays] = useState("0");

  const [saving, setSaving] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [removingRuleId, setRemovingRuleId] =
    useState<string | null>(null);

  const assignmentsByRule = useMemo(() => {
    const map = new Map<string, EventAssignment[]>();

    for (const item of assignments) {
      if (!item.rule_id) continue;

      const current = map.get(item.rule_id) ?? [];
      current.push(item);
      map.set(item.rule_id, current);
    }

    return map;
  }, [assignments]);

  const departmentById = useMemo(
    () => new Map(departments.map((item) => [item.id, item])),
    [departments]
  );

  const selectedDepartment = useMemo(
    () =>
      departments.find(
        (item) => item.id === selectedDepartmentId
      ) ?? null,
    [departments, selectedDepartmentId]
  );

  const selectedFunction = useMemo(
    () =>
      functions.find(
        (item) => item.function_id === selectedFunctionId
      ) ?? null,
    [functions, selectedFunctionId]
  );

  const activeFunctions = useMemo(
    () => functions.filter((item) => item.active),
    [functions]
  );

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [
        departmentResponse,
        rulesResponse,
        assignmentsResponse,
        communionResponse,
      ] = await Promise.all([
        supabase.rpc("list_departments_detailed", {
          p_organization_id: activeOrganization.id,
          p_unit_id: activeUnit.id,
        }),
        supabase
          .from("schedule_rules")
          .select(
            "id,department_id,department_function_id,role_label,required_count,rotation_mode,min_rest_days"
          )
          .eq("organization_id", activeOrganization.id)
          .eq("event_id", service.id)
          .eq("active", true)
          .order("created_at", { ascending: true }),
        supabase.rpc("list_event_schedule", {
          p_organization_id: activeOrganization.id,
          p_event_id: service.id,
        }),
        supabase.rpc("is_communion_event", {
          p_organization_id: activeOrganization.id,
          p_event_id: service.id,
        }),
      ]);

      if (departmentResponse.error) throw departmentResponse.error;
      if (rulesResponse.error) throw rulesResponse.error;
      if (assignmentsResponse.error) throw assignmentsResponse.error;

      setDepartments(
        ((departmentResponse.data ?? []) as any[]).map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description ?? null,
          member_count: Number(item.member_count ?? 0),
        }))
      );
      setRules((rulesResponse.data ?? []) as EventRule[]);
      setAssignments(
        (assignmentsResponse.data ?? []) as EventAssignment[]
      );
      setIsCommunion(Boolean(communionResponse.data));
    } catch (error) {
      Alert.alert(
        "Escala do culto",
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a escala."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit, service.id]);

  const loadFunctions = useCallback(async () => {
    if (!activeOrganization || !selectedDepartmentId) {
      setFunctions([]);
      setSelectedFunctionId(null);
      return;
    }

    setLoadingFunctions(true);

    try {
      const { data, error } = await supabase.rpc(
        "list_department_functions",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: selectedDepartmentId,
        }
      );

      if (error) throw error;

      const next = ((data ?? []) as any[]).map((item) => ({
        ...item,
        default_required_count: Number(
          item.default_required_count ?? 1
        ),
        sort_order: Number(item.sort_order ?? 0),
        qualified_member_count: Number(
          item.qualified_member_count ?? 0
        ),
      })) as DepartmentFunction[];

      setFunctions(next);

      const first = next.find((item) => item.active) ?? null;
      setSelectedFunctionId(first?.function_id ?? null);
      setRequiredCount(
        String(first?.default_required_count ?? 1)
      );
    } catch (error) {
      setFunctions([]);
      setSelectedFunctionId(null);

      Alert.alert(
        "Funções do departamento",
        error instanceof Error
          ? error.message
          : "Não foi possível carregar."
      );
    } finally {
      setLoadingFunctions(false);
    }
  }, [activeOrganization, selectedDepartmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadFunctions();
  }, [loadFunctions]);

  function chooseFunction(item: DepartmentFunction) {
    setSelectedFunctionId(item.function_id);
    setRequiredCount(String(item.default_required_count));
  }

  async function saveFunctionRule() {
    if (
      !activeOrganization ||
      !selectedDepartmentId ||
      !selectedFunctionId
    ) {
      Alert.alert(
        "Função necessária",
        "Escolha o departamento e a função desta escala."
      );
      return;
    }

    const count = Math.max(
      1,
      Number.parseInt(requiredCount.replace(/\D/g, ""), 10) || 1
    );
    const rest = Math.max(
      0,
      Number.parseInt(minRestDays.replace(/\D/g, ""), 10) || 0
    );

    setSaving(true);

    try {
      const { error } = await supabase.rpc(
        "save_event_schedule_function_rule",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: selectedDepartmentId,
          p_event_id: service.id,
          p_department_function_id: selectedFunctionId,
          p_required_count: count,
          p_rotation_mode: rotationMode,
          p_min_rest_days: rest,
        }
      );

      if (error) throw error;

      await load();

      Alert.alert(
        "Função adicionada",
        `${selectedFunction?.function_name ?? "A função"} foi adicionada somente à escala desta data.`
      );
    } catch (error) {
      Alert.alert(
        "Escala não criada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  async function applyTemplate() {
    if (!activeOrganization || !selectedDepartmentId) {
      Alert.alert(
        "Departamento necessário",
        "Escolha o departamento primeiro."
      );
      return;
    }

    if (activeFunctions.length === 0) {
      Alert.alert(
        "Sem funções",
        "Cadastre as funções deste departamento antes de gerar a escala completa."
      );
      return;
    }

    setApplyingTemplate(true);

    try {
      const { error } = await supabase.rpc(
        "apply_department_schedule_template",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: selectedDepartmentId,
          p_event_id: service.id,
        }
      );

      if (error) throw error;

      await load();

      const totalPeople = activeFunctions.reduce(
        (sum, item) => sum + item.default_required_count,
        0
      );

      Alert.alert(
        "Escala do departamento criada",
        `${activeFunctions.length} função(ões) aplicadas nesta data, com até ${totalPeople} pessoa(s) previstas.`
      );
    } catch (error) {
      Alert.alert(
        "Escala não criada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setApplyingTemplate(false);
    }
  }

  function confirmRemove(rule: EventRule) {
    Alert.alert(
      "Remover esta função da escala?",
      "Somente esta data será afetada. As funções cadastradas no departamento continuam disponíveis para outros cultos.",
      [
        { text: "Voltar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: () => void removeRule(rule),
        },
      ]
    );
  }

  async function removeRule(rule: EventRule) {
    if (!activeOrganization) return;

    setRemovingRuleId(rule.id);

    try {
      const { error } = await supabase.rpc(
        "remove_event_schedule_rule",
        {
          p_organization_id: activeOrganization.id,
          p_rule_id: rule.id,
        }
      );

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Não foi possível remover",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setRemovingRuleId(null);
    }
  }

  return (
    <EloScreen
      title={isCommunion ? "Escala especial de Ceia" : "Escala do culto"}
      eyebrow={isCommunion ? "ELO • CEIA" : "ELO • SERVIR"}
      subtitle={service.title}
      onBack={onBack}
    >
      {isCommunion ? (
        <View style={styles.communionBanner}>
          <View style={styles.communionIcon}>
            <P.CalendarCheckIcon
              size={22}
              color="#9A5B00"
              weight="duotone"
            />
          </View>
          <View style={styles.grow}>
            <Text style={styles.communionTitle}>
              Culto de Ceia
            </Text>
            <Text style={styles.communionText}>
              Além das funções normais, esta data inclui Servir o pão, Servir o vinho e Preparar a ceia.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.eventContext}>
        <P.CalendarDotsIcon
          size={20}
          color={eloColors.blue}
          weight="duotone"
        />

        <View style={styles.eventCopy}>
          <Text style={styles.eventDate}>
            {formatDateTime(service.starts_at)}
          </Text>
          <Text style={styles.eventHint}>
            Cada departamento pode ter várias funções. Esta escala
            vale somente para esta data.
          </Text>
        </View>
      </View>

      {canManage ? (
        <View style={styles.primaryAction}>
          <EloActionButton
            label={showForm ? "Fechar" : "Montar escala desta data"}
            variant={showForm ? "secondary" : "primary"}
            icon={showForm ? "XIcon" : "PlusIcon"}
            onPress={() => setShowForm((value) => !value)}
          />
        </View>
      ) : null}

      {showForm ? (
        <EloCard>
          <Text style={eloSharedStyles.cardTitle}>
            Escolha o departamento
          </Text>

          <View style={styles.choiceList}>
            {departments.map((department) => (
              <Pressable
                key={department.id}
                onPress={() => {
                  setSelectedDepartmentId(department.id);
                  setSelectedFunctionId(null);
                }}
                style={[
                  styles.choice,
                  selectedDepartmentId === department.id &&
                    styles.choiceSelected,
                ]}
              >
                <View style={styles.grow}>
                  <Text style={styles.choiceTitle}>
                    {department.name}
                  </Text>
                  <Text style={styles.choiceMeta}>
                    {department.member_count} pessoa
                    {department.member_count === 1 ? "" : "s"} na equipe
                  </Text>
                </View>

                {selectedDepartmentId === department.id ? (
                  <P.CheckCircleIcon
                    size={19}
                    color={eloColors.blue}
                    weight="fill"
                  />
                ) : null}
              </Pressable>
            ))}
          </View>

          {selectedDepartment ? (
            <>
              <Text style={styles.label}>
                Funções de {selectedDepartment.name}
              </Text>

              {loadingFunctions ? (
                <ActivityIndicator />
              ) : activeFunctions.length === 0 ? (
                <View style={styles.noFunctions}>
                  <P.InfoIcon
                    size={18}
                    color={eloColors.muted}
                  />
                  <Text style={styles.noFunctionsText}>
                    Este departamento ainda não tem funções
                    cadastradas. Cadastre em Meu Elo → Equipes para
                    escala.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.functionList}>
                    {activeFunctions.map((item) => {
                      const selected =
                        selectedFunctionId === item.function_id;

                      return (
                        <Pressable
                          key={item.function_id}
                          onPress={() => chooseFunction(item)}
                          style={[
                            styles.functionChoice,
                            selected &&
                              styles.functionChoiceSelected,
                          ]}
                        >
                          <View style={styles.grow}>
                            <Text style={styles.functionName}>
                              {item.function_name}
                            </Text>
                            <Text style={styles.functionMeta}>
                              Padrão: {item.default_required_count} •{" "}
                              {item.qualified_member_count} pessoa
                              {item.qualified_member_count === 1
                                ? ""
                                : "s"}{" "}
                              habilitada
                              {item.qualified_member_count === 1
                                ? ""
                                : "s"}
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

                  <View style={styles.templateAction}>
                    <EloActionButton
                      label="Gerar escala completa do departamento"
                      icon="SparkleIcon"
                      loading={applyingTemplate}
                      onPress={() => void applyTemplate()}
                    />
                    <Text style={styles.templateHint}>
                      Usa todas as funções acima e suas quantidades
                      padrão somente neste culto.
                    </Text>
                  </View>
                </>
              )}
            </>
          ) : null}

          {selectedFunction ? (
            <>
              <Text style={styles.label}>
                Ajustar {selectedFunction.function_name}
              </Text>

              <View style={styles.twoColumns}>
                <View style={styles.grow}>
                  <Text style={styles.fieldLabel}>
                    Pessoas nesta função
                  </Text>
                  <TextInput
                    value={requiredCount}
                    onChangeText={(value) =>
                      setRequiredCount(value.replace(/\D/g, ""))
                    }
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>

                <View style={styles.grow}>
                  <Text style={styles.fieldLabel}>
                    Descanso mínimo
                  </Text>
                  <TextInput
                    value={minRestDays}
                    onChangeText={(value) =>
                      setMinRestDays(value.replace(/\D/g, ""))
                    }
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
              </View>

              <Text style={styles.label}>Rodízio</Text>
              <View style={styles.twoColumns}>
                <Pressable
                  onPress={() => setRotationMode("balanced")}
                  style={[
                    styles.modeChoice,
                    rotationMode === "balanced" &&
                      styles.choiceSelected,
                  ]}
                >
                  <Text style={styles.modeTitle}>Equilibrado</Text>
                  <Text style={styles.modeText}>
                    Prioriza quem serviu menos.
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setRotationMode("fixed")}
                  style={[
                    styles.modeChoice,
                    rotationMode === "fixed" &&
                      styles.choiceSelected,
                  ]}
                >
                  <Text style={styles.modeTitle}>
                    Ordem da equipe
                  </Text>
                  <Text style={styles.modeText}>
                    Segue a ordem cadastrada.
                  </Text>
                </Pressable>
              </View>

              <View style={styles.formAction}>
                <EloActionButton
                  label={`Adicionar ${selectedFunction.function_name}`}
                  icon="PlusIcon"
                  loading={saving}
                  onPress={() => void saveFunctionRule()}
                />
              </View>
            </>
          ) : null}
        </EloCard>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>
        Equipe desta data
      </Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : rules.length === 0 ? (
        <EloState
          title="Este culto ainda não tem escala"
          description="Abra “Montar escala desta data”, escolha um departamento e aplique suas funções."
          icon="CalendarCheckIcon"
        />
      ) : (
        <View style={styles.ruleList}>
          {rules.map((rule) => {
            const people = assignmentsByRule.get(rule.id) ?? [];
            const department =
              departmentById.get(rule.department_id);

            return (
              <EloCard key={rule.id}>
                <View style={styles.ruleHeader}>
                  <View style={styles.ruleIcon}>
                    <P.UsersThreeIcon
                      size={21}
                      color={eloColors.blue}
                      weight="duotone"
                    />
                  </View>

                  <View style={styles.grow}>
                    <Text style={eloSharedStyles.cardTitle}>
                      {rule.role_label}
                    </Text>
                    <Text style={styles.ruleMeta}>
                      {department?.name ?? "Departamento"} •{" "}
                      {rule.required_count} pessoa
                      {rule.required_count === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>

                <View style={styles.peopleList}>
                  {people.length === 0 ? (
                    <View style={styles.vacancy}>
                      <P.WarningCircleIcon
                        size={17}
                        color={eloColors.yellow}
                        weight="duotone"
                      />
                      <Text style={styles.vacancyText}>
                        Nenhuma pessoa habilitada e disponível para
                        esta função.
                      </Text>
                    </View>
                  ) : (
                    people.map((person) => (
                      <View
                        key={person.assignment_id}
                        style={styles.personRow}
                      >
                        <View style={styles.avatar}>
                          <P.UserIcon
                            size={17}
                            color={eloColors.muted}
                          />
                        </View>

                        <View style={styles.grow}>
                          <Text style={styles.personName}>
                            {person.person_name}
                          </Text>
                          <Text style={styles.personMeta}>
                            {person.role_label}
                          </Text>
                        </View>

                        <Text style={styles.status}>
                          {statusLabel(person.status)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>

                {people.length < rule.required_count ? (
                  <Text style={styles.missingCount}>
                    Faltam {rule.required_count - people.length} pessoa
                    {rule.required_count - people.length === 1
                      ? ""
                      : "s"}{" "}
                    nesta função.
                  </Text>
                ) : null}

                {canManage ? (
                  <Pressable
                    disabled={removingRuleId === rule.id}
                    onPress={() => confirmRemove(rule)}
                    style={styles.removeRule}
                  >
                    <Text style={styles.removeRuleText}>
                      {removingRuleId === rule.id
                        ? "Removendo..."
                        : "Remover esta função da escala"}
                    </Text>
                  </Pressable>
                ) : null}
              </EloCard>
            );
          })}
        </View>
      )}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  communionBanner: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    borderRadius: 16,
    backgroundColor: "#FFF3D9",
  },
  communionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#FFE7B0",
  },
  communionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#6F4300",
  },
  communionText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 16,
    color: "#815A1B",
  },
  eventContext: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#EAF5FB",
  },
  eventCopy: {
    flex: 1,
  },
  eventDate: {
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  eventHint: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.muted,
  },
  primaryAction: {
    marginTop: 16,
  },
  label: {
    marginTop: 15,
    marginBottom: 7,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  fieldLabel: {
    marginBottom: 6,
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  choiceList: {
    marginTop: 12,
    gap: 7,
  },
  choice: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
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
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  choiceMeta: {
    marginTop: 3,
    fontSize: 10,
    color: eloColors.muted,
  },
  functionList: {
    gap: 7,
  },
  functionChoice: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  functionChoiceSelected: {
    borderColor: "#8CC5E8",
    backgroundColor: "#F2F9FD",
  },
  functionName: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  functionMeta: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  noFunctions: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#F6F7F8",
  },
  noFunctionsText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 16,
    color: eloColors.muted,
  },
  templateAction: {
    marginTop: 12,
  },
  templateHint: {
    marginTop: 6,
    paddingHorizontal: 3,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
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
  twoColumns: {
    flexDirection: "row",
    gap: 9,
  },
  grow: {
    flex: 1,
  },
  modeChoice: {
    flex: 1,
    minHeight: 78,
    padding: 11,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  modeTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  modeText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
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
  ruleMeta: {
    marginTop: 3,
    fontSize: 11,
    color: eloColors.muted,
  },
  peopleList: {
    marginTop: 13,
    borderTopWidth: 1,
    borderTopColor: eloColors.line,
  },
  personRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: eloColors.line,
  },
  avatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#F2F4F6",
  },
  personName: {
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.ink,
  },
  personMeta: {
    marginTop: 2,
    fontSize: 10,
    color: eloColors.muted,
  },
  status: {
    fontSize: 9,
    fontWeight: "900",
    color: eloColors.blue,
  },
  vacancy: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vacancyText: {
    flex: 1,
    fontSize: 11,
    color: eloColors.muted,
  },
  missingCount: {
    marginTop: 9,
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.yellow,
  },
  removeRule: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  removeRuleText: {
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.danger,
  },
});
