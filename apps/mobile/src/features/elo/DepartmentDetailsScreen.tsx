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
} from "./EloUi";

const P = Phosphor as any;

export type DepartmentSummary = {
  id: string;
  name: string;
  description: string | null;
  leader_person_id: string | null;
  leader_name: string | null;
  member_count: number;
  function_count: number;
  active: boolean;
};

type DepartmentMember = {
  membership_id: string;
  person_id: string;
  full_name: string;
  preferred_name: string | null;
  function_name: string | null;
  sort_order: number;
  can_serve: boolean;
  status: string;
};

type PersonCandidate = {
  person_id: string;
  full_name: string;
  preferred_name: string | null;
  membership_type: string;
};

type Routine = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  active: boolean;
};

type ScheduleRule = {
  id: string;
  routine_id: string;
  role_label: string;
  required_count: number;
  rotation_mode: "balanced" | "fixed";
  min_rest_days: number;
  horizon_days: number;
  active: boolean;
};

const WEEKDAYS = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
];

function personLabel(person: PersonCandidate | DepartmentMember) {
  return person.preferred_name?.trim() || person.full_name;
}

export function DepartmentDetailsScreen({
  department,
  onBack,
}: {
  department: DepartmentSummary;
  onBack: () => void;
}) {
  const {
    activeOrganization,
    activeUnit,
    can,
    canAtOrganization,
  } = useOrganization();

  const canManage =
    can("departments.manage") ||
    canAtOrganization("departments.manage");

  const canSchedule =
    can("schedules.manage") ||
    canAtOrganization("schedules.manage");

  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [candidates, setCandidates] = useState<PersonCandidate[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [showMemberForm, setShowMemberForm] = useState(false);
  const [selectedPerson, setSelectedPerson] =
    useState<PersonCandidate | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [savingMember, setSavingMember] = useState(false);

  const [showRuleForm, setShowRuleForm] = useState(false);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(
    null
  );
  const [roleLabel, setRoleLabel] = useState("");
  const [requiredCount, setRequiredCount] = useState("1");
  const [rotationMode, setRotationMode] =
    useState<"balanced" | "fixed">("balanced");
  const [minRestDays, setMinRestDays] = useState("0");
  const [savingRule, setSavingRule] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const routineById = useMemo(
    () => new Map(routines.map((routine) => [routine.id, routine])),
    [routines]
  );

  const memberIds = useMemo(
    () => new Set(members.filter((m) => m.status === "active").map((m) => m.person_id)),
    [members]
  );

  const filteredCandidates = useMemo(() => {
    const query = personSearch.trim().toLowerCase();

    return candidates
      .filter((candidate) => !memberIds.has(candidate.person_id))
      .filter((candidate) => {
        if (!query) return true;
        return [
          candidate.full_name,
          candidate.preferred_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 20);
  }, [candidates, memberIds, personSearch]);

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const requests: PromiseLike<any>[] = [
        supabase.rpc("list_department_members", {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
        }),
        supabase
          .from("service_routines")
          .select("id,name,weekday,start_time,active")
          .eq("organization_id", activeOrganization.id)
          .eq("unit_id", activeUnit.id)
          .eq("active", true)
          .order("weekday", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("schedule_rules")
          .select(
            "id,routine_id,role_label,required_count,rotation_mode,min_rest_days,horizon_days,active"
          )
          .eq("organization_id", activeOrganization.id)
          .eq("department_id", department.id)
          .eq("active", true)
          .order("created_at", { ascending: true }),
      ];

      if (canManage || canSchedule) {
        requests.push(
          supabase.rpc("list_department_people_candidates", {
            p_organization_id: activeOrganization.id,
            p_unit_id: activeUnit.id,
          })
        );
      }

      const results = await Promise.all(requests);
      const membersResponse = results[0];
      const routinesResponse = results[1];
      const rulesResponse = results[2];

      if (membersResponse.error) throw membersResponse.error;
      if (routinesResponse.error) throw routinesResponse.error;
      if (rulesResponse.error) throw rulesResponse.error;

      setMembers((membersResponse.data ?? []) as DepartmentMember[]);
      setRoutines((routinesResponse.data ?? []) as Routine[]);
      setRules((rulesResponse.data ?? []) as ScheduleRule[]);

      if (results[3]) {
        if (results[3].error) throw results[3].error;
        setCandidates((results[3].data ?? []) as PersonCandidate[]);
      } else {
        setCandidates([]);
      }
    } catch (error) {
      Alert.alert(
        "Departamento",
        error instanceof Error ? error.message : "Não foi possível carregar."
      );
    } finally {
      setLoading(false);
    }
  }, [
    activeOrganization,
    activeUnit,
    department.id,
    canManage,
    canSchedule,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMember() {
    if (!activeOrganization || !selectedPerson) return;

    setSavingMember(true);

    try {
      const { error } = await supabase.rpc("add_department_member", {
        p_organization_id: activeOrganization.id,
        p_department_id: department.id,
        p_person_id: selectedPerson.person_id,
        p_function_name: functionName.trim() || null,
        p_can_serve: true,
      });

      if (error) throw error;

      if (canSchedule) {
        await supabase.rpc("refresh_schedules", {
          p_organization_id: activeOrganization.id,
        });
      }

      setSelectedPerson(null);
      setFunctionName("");
      setPersonSearch("");
      setShowMemberForm(false);
      await load();
    } catch (error) {
      Alert.alert(
        "Pessoa não adicionada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingMember(false);
    }
  }

  async function saveRule() {
    if (
      !activeOrganization ||
      !selectedRoutineId
    ) {
      Alert.alert(
        "Culto necessário",
        "Escolha o culto recorrente desta escala."
      );
      return;
    }

    if (roleLabel.trim().length < 2) {
      Alert.alert(
        "Função necessária",
        "Informe a função da escala, por exemplo: Porteiro."
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

    setSavingRule(true);

    try {
      const { error } = await supabase.rpc("save_schedule_rule", {
        p_organization_id: activeOrganization.id,
        p_department_id: department.id,
        p_routine_id: selectedRoutineId,
        p_role_label: roleLabel.trim(),
        p_required_count: count,
        p_rotation_mode: rotationMode,
        p_min_rest_days: rest,
        p_horizon_days: 60,
      });

      if (error) throw error;

      setSelectedRoutineId(null);
      setRoleLabel("");
      setRequiredCount("1");
      setMinRestDays("0");
      setRotationMode("balanced");
      setShowRuleForm(false);
      await load();

      Alert.alert(
        "Escala ativada",
        "O Elo gerou as próximas escalas usando essa regra."
      );
    } catch (error) {
      Alert.alert(
        "Regra não salva",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingRule(false);
    }
  }

  async function refreshSchedules() {
    if (!activeOrganization) return;

    setRefreshing(true);

    try {
      const { data, error } = await supabase.rpc(
        "refresh_schedules",
        {
          p_organization_id: activeOrganization.id,
        }
      );

      if (error) throw error;

      const result = (data ?? {}) as {
        assignments_created?: number;
        vacancies?: number;
      };

      Alert.alert(
        "Escalas atualizadas",
        `${result.assignments_created ?? 0} nova(s) escala(s) gerada(s).${
          result.vacancies
            ? ` Ainda existem ${result.vacancies} vaga(s) sem pessoa disponível.`
            : ""
        }`
      );

      await load();
    } catch (error) {
      Alert.alert(
        "Não foi possível atualizar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <EloScreen
      title={department.name}
      eyebrow="ELO • DEPARTAMENTO"
      subtitle={
        department.description ||
        "Equipe, funções e regras de escala deste departamento."
      }
      onBack={onBack}
    >
      <Text style={eloSharedStyles.sectionTitle}>Equipe</Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : members.filter((item) => item.status === "active").length === 0 ? (
        <EloState
          title="Nenhuma pessoa na equipe"
          description={
            canManage
              ? "Adicione pessoas. O motor de escala só usa membros ativos deste departamento."
              : "A liderança ainda não adicionou pessoas a esta equipe."
          }
          icon="UsersThreeIcon"
        />
      ) : (
        <View style={styles.list}>
          {members
            .filter((item) => item.status === "active")
            .map((member) => (
              <EloCard key={member.membership_id}>
                <View style={styles.row}>
                  <View style={styles.personIcon}>
                    <P.UserIcon
                      size={20}
                      color={eloColors.blue}
                      weight="duotone"
                    />
                  </View>
                  <View style={styles.grow}>
                    <Text style={eloSharedStyles.cardTitle}>
                      {personLabel(member)}
                    </Text>
                    <Text style={styles.meta}>
                      {member.function_name || "Sem função fixa"}
                      {member.can_serve ? " • Disponível para escala" : ""}
                    </Text>
                  </View>
                </View>
              </EloCard>
            ))}
        </View>
      )}

      {canManage ? (
        <View style={styles.actionGap}>
          <EloActionButton
            label={showMemberForm ? "Fechar" : "Adicionar pessoa"}
            variant={showMemberForm ? "secondary" : "primary"}
            icon={showMemberForm ? "XIcon" : "UserPlusIcon"}
            onPress={() => {
              setShowMemberForm((value) => !value);
              setSelectedPerson(null);
            }}
          />
        </View>
      ) : null}

      {showMemberForm ? (
        <EloCard>
          {selectedPerson ? (
            <>
              <Text style={eloSharedStyles.cardTitle}>
                {personLabel(selectedPerson)}
              </Text>
              <Text style={styles.label}>Função no departamento</Text>
              <TextInput
                value={functionName}
                onChangeText={setFunctionName}
                placeholder="Ex.: Porteiro, vocal, câmera"
                placeholderTextColor="#A1A9B0"
                style={styles.input}
              />

              <View style={styles.formActions}>
                <EloActionButton
                  label="Adicionar à equipe"
                  icon="CheckIcon"
                  loading={savingMember}
                  onPress={() => void addMember()}
                />
                <EloActionButton
                  label="Escolher outra pessoa"
                  variant="secondary"
                  onPress={() => setSelectedPerson(null)}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={eloSharedStyles.cardTitle}>
                Escolha uma pessoa
              </Text>
              <TextInput
                value={personSearch}
                onChangeText={setPersonSearch}
                placeholder="Buscar pelo nome"
                placeholderTextColor="#A1A9B0"
                style={[styles.input, styles.search]}
              />

              <View style={styles.candidateList}>
                {filteredCandidates.length === 0 ? (
                  <Text style={styles.emptyText}>
                    Nenhuma pessoa disponível.
                  </Text>
                ) : (
                  filteredCandidates.map((person) => (
                    <Pressable
                      key={person.person_id}
                      onPress={() => setSelectedPerson(person)}
                      style={styles.candidate}
                    >
                      <View style={styles.grow}>
                        <Text style={styles.candidateName}>
                          {personLabel(person)}
                        </Text>
                        <Text style={styles.meta}>
                          {person.membership_type}
                        </Text>
                      </View>
                      <P.CaretRightIcon
                        size={17}
                        color="#9AA4AE"
                        weight="bold"
                      />
                    </Pressable>
                  ))
                )}
              </View>
            </>
          )}
        </EloCard>
      ) : null}

      {canSchedule ? (
        <>
          <Text style={eloSharedStyles.sectionTitle}>
            Regras de escala
          </Text>

          {rules.length === 0 ? (
            <EloState
              title="Nenhuma regra de escala"
              description="Crie uma regra para o Elo montar automaticamente as próximas escalas deste departamento."
              icon="CalendarCheckIcon"
            />
          ) : (
            <View style={styles.list}>
              {rules.map((rule) => {
                const routine = routineById.get(rule.routine_id);

                return (
                  <EloCard key={rule.id}>
                    <View style={styles.row}>
                      <View style={styles.ruleIcon}>
                        <P.CalendarCheckIcon
                          size={20}
                          color={eloColors.blue}
                          weight="duotone"
                        />
                      </View>
                      <View style={styles.grow}>
                        <Text style={eloSharedStyles.cardTitle}>
                          {rule.role_label}
                        </Text>
                        <Text style={styles.meta}>
                          {routine?.name || "Culto recorrente"} •{" "}
                          {rule.required_count} pessoa
                          {rule.required_count === 1 ? "" : "s"}
                        </Text>
                        <Text style={styles.ruleMeta}>
                          {rule.rotation_mode === "balanced"
                            ? "Rodízio equilibrado"
                            : "Ordem fixa"}
                          {rule.min_rest_days > 0
                            ? ` • descanso ${rule.min_rest_days} dia(s)`
                            : ""}
                        </Text>
                      </View>
                    </View>
                  </EloCard>
                );
              })}
            </View>
          )}

          <View style={styles.actionGap}>
            <EloActionButton
              label={showRuleForm ? "Fechar regra" : "Nova regra de escala"}
              variant={showRuleForm ? "secondary" : "primary"}
              icon={showRuleForm ? "XIcon" : "PlusIcon"}
              onPress={() => setShowRuleForm((value) => !value)}
            />
          </View>

          {showRuleForm ? (
            <EloCard>
              <Text style={eloSharedStyles.cardTitle}>
                Nova regra automática
              </Text>

              <Text style={styles.label}>Culto recorrente</Text>
              <View style={styles.choiceList}>
                {routines.length === 0 ? (
                  <Text style={styles.emptyText}>
                    Crie primeiro um culto recorrente na Agenda.
                  </Text>
                ) : (
                  routines.map((routine) => (
                    <Pressable
                      key={routine.id}
                      onPress={() => setSelectedRoutineId(routine.id)}
                      style={[
                        styles.routineChoice,
                        selectedRoutineId === routine.id &&
                          styles.routineChoiceSelected,
                      ]}
                    >
                      <View style={styles.grow}>
                        <Text style={styles.candidateName}>
                          {routine.name}
                        </Text>
                        <Text style={styles.meta}>
                          {WEEKDAYS[routine.weekday]} •{" "}
                          {routine.start_time.slice(0, 5)}
                        </Text>
                      </View>
                      {selectedRoutineId === routine.id ? (
                        <P.CheckCircleIcon
                          size={19}
                          color={eloColors.blue}
                          weight="fill"
                        />
                      ) : null}
                    </Pressable>
                  ))
                )}
              </View>

              <Text style={styles.label}>Função da escala</Text>
              <TextInput
                value={roleLabel}
                onChangeText={setRoleLabel}
                placeholder="Ex.: Porteiro"
                placeholderTextColor="#A1A9B0"
                style={styles.input}
              />

              <View style={styles.twoColumns}>
                <View style={styles.grow}>
                  <Text style={styles.label}>Pessoas por culto</Text>
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

              <Text style={styles.label}>Rodízio</Text>
              <View style={styles.twoColumns}>
                <Pressable
                  onPress={() => setRotationMode("balanced")}
                  style={[
                    styles.rotationChoice,
                    rotationMode === "balanced" &&
                      styles.routineChoiceSelected,
                  ]}
                >
                  <Text style={styles.rotationTitle}>Equilibrado</Text>
                  <Text style={styles.rotationText}>
                    Distribui melhor as escalas.
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setRotationMode("fixed")}
                  style={[
                    styles.rotationChoice,
                    rotationMode === "fixed" &&
                      styles.routineChoiceSelected,
                  ]}
                >
                  <Text style={styles.rotationTitle}>Ordem fixa</Text>
                  <Text style={styles.rotationText}>
                    Segue a ordem da equipe.
                  </Text>
                </Pressable>
              </View>

              <View style={styles.formActions}>
                <EloActionButton
                  label="Ativar regra e gerar escalas"
                  icon="SparkleIcon"
                  loading={savingRule}
                  disabled={routines.length === 0}
                  onPress={() => void saveRule()}
                />
              </View>
            </EloCard>
          ) : null}

          {rules.length > 0 ? (
            <View style={styles.refreshAction}>
              <EloActionButton
                label="Atualizar próximas escalas"
                variant="secondary"
                icon="ArrowsClockwiseIcon"
                loading={refreshing}
                onPress={() => void refreshSchedules()}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 36,
    alignItems: "center",
  },
  list: {
    gap: 9,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  grow: {
    flex: 1,
  },
  personIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  ruleIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#EAF5FB",
  },
  meta: {
    marginTop: 4,
    fontSize: 11,
    color: eloColors.muted,
  },
  ruleMeta: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: eloColors.blue,
  },
  actionGap: {
    marginTop: 12,
  },
  label: {
    marginTop: 15,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "800",
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
  search: {
    marginTop: 13,
  },
  formActions: {
    marginTop: 16,
    gap: 8,
  },
  candidateList: {
    marginTop: 10,
    gap: 7,
  },
  candidate: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  candidateName: {
    fontSize: 13,
    fontWeight: "800",
    color: eloColors.ink,
  },
  emptyText: {
    paddingVertical: 12,
    fontSize: 12,
    lineHeight: 18,
    color: eloColors.muted,
  },
  choiceList: {
    gap: 7,
  },
  routineChoice: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  routineChoiceSelected: {
    borderColor: "#8CC5E8",
    backgroundColor: "#F2F9FD",
  },
  twoColumns: {
    flexDirection: "row",
    gap: 9,
  },
  rotationChoice: {
    flex: 1,
    minHeight: 78,
    padding: 11,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  rotationTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  rotationText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  refreshAction: {
    marginTop: 10,
  },
});
