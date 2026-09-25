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

type EventRule = {
  id: string;
  department_id: string;
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
  const [rules, setRules] = useState<EventRule[]>([]);
  const [assignments, setAssignments] = useState<EventAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] =
    useState<string | null>(null);
  const [roleLabel, setRoleLabel] = useState("");
  const [requiredCount, setRequiredCount] = useState("1");
  const [rotationMode, setRotationMode] =
    useState<"balanced" | "fixed">("balanced");
  const [minRestDays, setMinRestDays] = useState("0");
  const [saving, setSaving] = useState(false);
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
      ] = await Promise.all([
        supabase.rpc("list_departments_detailed", {
          p_organization_id: activeOrganization.id,
          p_unit_id: activeUnit.id,
        }),
        supabase
          .from("schedule_rules")
          .select(
            "id,department_id,role_label,required_count,rotation_mode,min_rest_days"
          )
          .eq("organization_id", activeOrganization.id)
          .eq("event_id", service.id)
          .eq("active", true)
          .order("created_at", { ascending: true }),
        supabase.rpc("list_event_schedule", {
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

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRule() {
    if (!activeOrganization || !selectedDepartmentId) {
      Alert.alert(
        "Departamento necessário",
        "Escolha qual departamento vai servir neste culto."
      );
      return;
    }

    if (roleLabel.trim().length < 2) {
      Alert.alert(
        "Função necessária",
        "Informe a função da escala, por exemplo: Portaria."
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
        "save_event_schedule_rule",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: selectedDepartmentId,
          p_event_id: service.id,
          p_role_label: roleLabel.trim(),
          p_required_count: count,
          p_rotation_mode: rotationMode,
          p_min_rest_days: rest,
        }
      );

      if (error) throw error;

      setSelectedDepartmentId(null);
      setRoleLabel("");
      setRequiredCount("1");
      setRotationMode("balanced");
      setMinRestDays("0");
      setShowForm(false);

      await load();

      const { data } = await supabase.rpc("list_event_schedule", {
        p_organization_id: activeOrganization.id,
        p_event_id: service.id,
      });

      const current = (data ?? []) as EventAssignment[];

      if (
        current.filter(
          (item) =>
            item.department_id === selectedDepartmentId &&
            item.role_label.toLowerCase() ===
              roleLabel.trim().toLowerCase()
        ).length === 0
      ) {
        Alert.alert(
          "Escala criada sem voluntário",
          "A regra ficou salva para esta data, mas o Elo não encontrou uma pessoa disponível no departamento."
        );
      }
    } catch (error) {
      Alert.alert(
        "Escala não criada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmRemove(rule: EventRule) {
    Alert.alert(
      "Remover esta escala?",
      "Somente esta data será afetada. Os outros cultos da rotina não mudam.",
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
      title="Escala do culto"
      eyebrow="ELO • SERVIR"
      subtitle={service.title}
      onBack={onBack}
    >
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
            Esta escala vale somente para esta data.
          </Text>
        </View>
      </View>

      {canManage ? (
        <View style={styles.primaryAction}>
          <EloActionButton
            label={showForm ? "Fechar" : "Criar escala desta data"}
            variant={showForm ? "secondary" : "primary"}
            icon={showForm ? "XIcon" : "PlusIcon"}
            onPress={() => setShowForm((value) => !value)}
          />
        </View>
      ) : null}

      {showForm ? (
        <EloCard>
          <Text style={eloSharedStyles.cardTitle}>
            Quem serve neste culto?
          </Text>

          <Text style={styles.label}>Departamento</Text>

          <View style={styles.choiceList}>
            {departments.map((department) => (
              <Pressable
                key={department.id}
                onPress={() => {
                  setSelectedDepartmentId(department.id);

                  if (!roleLabel.trim()) {
                    setRoleLabel(department.name);
                  }
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

          <Text style={styles.label}>Função nesta data</Text>
          <TextInput
            value={roleLabel}
            onChangeText={setRoleLabel}
            placeholder="Ex.: Portaria"
            placeholderTextColor="#A1A9B0"
            style={styles.input}
          />

          <View style={styles.twoColumns}>
            <View style={styles.grow}>
              <Text style={styles.label}>Quantidade</Text>
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
              <Text style={styles.label}>Descanso mínimo</Text>
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

          <Text style={styles.label}>Como escolher a equipe?</Text>
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
                Prioriza quem serviu menos recentemente.
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
              <Text style={styles.modeTitle}>Ordem da equipe</Text>
              <Text style={styles.modeText}>
                Segue a ordem cadastrada no departamento.
              </Text>
            </Pressable>
          </View>

          <View style={styles.formAction}>
            <EloActionButton
              label="Gerar escala desta data"
              icon="SparkleIcon"
              loading={saving}
              disabled={departments.length === 0}
              onPress={() => void saveRule()}
            />
          </View>
        </EloCard>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>Equipe desta data</Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : rules.length === 0 ? (
        <EloState
          title="Este culto ainda não tem escala"
          description="A escala é criada por data. Criar aqui não altera os próximos cultos recorrentes."
          icon="CalendarCheckIcon"
        />
      ) : (
        <View style={styles.ruleList}>
          {rules.map((rule) => {
            const people = assignmentsByRule.get(rule.id) ?? [];
            const department = departmentById.get(rule.department_id);

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
                      {department?.name ?? "Departamento"}
                    </Text>
                    <Text style={styles.ruleMeta}>
                      {rule.role_label} • {rule.required_count} pessoa
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
                        Nenhuma pessoa disponível para esta função.
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

                {canManage ? (
                  <Pressable
                    disabled={removingRuleId === rule.id}
                    onPress={() => confirmRemove(rule)}
                    style={styles.removeRule}
                  >
                    <Text style={styles.removeRuleText}>
                      {removingRuleId === rule.id
                        ? "Removendo..."
                        : "Remover escala desta data"}
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
    color: eloColors.muted,
  },
  primaryAction: {
    marginTop: 16,
  },
  label: {
    marginTop: 15,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  choiceList: {
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
    minHeight: 84,
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
