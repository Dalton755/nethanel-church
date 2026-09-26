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

type DepartmentFunction = {
  function_id: string;
  function_name: string;
  default_required_count: number;
  sort_order: number;
  active: boolean;
  qualified_member_count: number;
};

type MemberFunction = {
  person_id: string;
  function_id: string;
  function_name: string;
};

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
  const [functions, setFunctions] = useState<DepartmentFunction[]>([]);
  const [memberFunctions, setMemberFunctions] =
    useState<MemberFunction[]>([]);
  const [candidates, setCandidates] = useState<PersonCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  const [showMemberForm, setShowMemberForm] = useState(false);
  const [selectedPerson, setSelectedPerson] =
    useState<PersonCandidate | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [savingMember, setSavingMember] = useState(false);

  const [showFunctionForm, setShowFunctionForm] = useState(false);
  const [newFunctionName, setNewFunctionName] = useState("");
  const [newFunctionCount, setNewFunctionCount] = useState("1");
  const [savingFunction, setSavingFunction] = useState(false);

  const [editingMemberFunctionsId, setEditingMemberFunctionsId] =
    useState<string | null>(null);
  const [selectedMemberFunctionIds, setSelectedMemberFunctionIds] =
    useState<string[]>([]);
  const [savingMemberFunctions, setSavingMemberFunctions] =
    useState(false);

  const [leaderName, setLeaderName] = useState<string | null>(
    department.leader_name
  );
  const [showLeaderPicker, setShowLeaderPicker] = useState(false);
  const [leaderSearch, setLeaderSearch] = useState("");
  const [savingLeader, setSavingLeader] = useState(false);

  const activeMembers = useMemo(
    () => members.filter((item) => item.status === "active"),
    [members]
  );

  const activeFunctions = useMemo(
    () => functions.filter((item) => item.active),
    [functions]
  );

  const memberIds = useMemo(
    () => new Set(activeMembers.map((item) => item.person_id)),
    [activeMembers]
  );

  const functionsByPerson = useMemo(() => {
    const map = new Map<string, MemberFunction[]>();

    for (const item of memberFunctions) {
      const current = map.get(item.person_id) ?? [];
      current.push(item);
      map.set(item.person_id, current);
    }

    return map;
  }, [memberFunctions]);

  const filteredLeaders = useMemo(() => {
    const query = leaderSearch.trim().toLowerCase();

    return candidates
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
  }, [candidates, leaderSearch]);

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
      const [
        membersResponse,
        functionsResponse,
        memberFunctionsResponse,
        candidatesResponse,
      ] = await Promise.all([
        supabase.rpc("list_department_members", {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
        }),
        supabase.rpc("list_department_functions", {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
        }),
        supabase.rpc("list_department_member_functions", {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
        }),
        canManage
          ? supabase.rpc("list_department_people_candidates", {
              p_organization_id: activeOrganization.id,
              p_unit_id: activeUnit.id,
            })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (membersResponse.error) throw membersResponse.error;
      if (functionsResponse.error) throw functionsResponse.error;
      if (memberFunctionsResponse.error) {
        throw memberFunctionsResponse.error;
      }
      if (candidatesResponse.error) throw candidatesResponse.error;

      setMembers(
        (membersResponse.data ?? []) as DepartmentMember[]
      );
      setFunctions(
        ((functionsResponse.data ?? []) as any[]).map((item) => ({
          ...item,
          default_required_count: Number(
            item.default_required_count ?? 1
          ),
          sort_order: Number(item.sort_order ?? 0),
          qualified_member_count: Number(
            item.qualified_member_count ?? 0
          ),
        })) as DepartmentFunction[]
      );
      setMemberFunctions(
        (memberFunctionsResponse.data ?? []) as MemberFunction[]
      );
      setCandidates(
        (candidatesResponse.data ?? []) as PersonCandidate[]
      );
    } catch (error) {
      Alert.alert(
        "Departamento",
        error instanceof Error
          ? error.message
          : "Não foi possível carregar."
      );
    } finally {
      setLoading(false);
    }
  }, [
    activeOrganization,
    activeUnit,
    department.id,
    canManage,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setLeader(person: PersonCandidate | null) {
    if (!activeOrganization) return;

    setSavingLeader(true);

    try {
      const { error } = await supabase.rpc(
        "set_department_leader",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
          p_person_id: person?.person_id ?? null,
        }
      );

      if (error) throw error;

      setLeaderName(person ? personLabel(person) : null);
      setLeaderSearch("");
      setShowLeaderPicker(false);
    } catch (error) {
      Alert.alert(
        "Liderança não alterada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingLeader(false);
    }
  }

  async function addMember() {
    if (!activeOrganization || !selectedPerson) return;

    setSavingMember(true);

    try {
      const { error } = await supabase.rpc(
        "add_department_member",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
          p_person_id: selectedPerson.person_id,
          p_function_name: null,
          p_can_serve: true,
        }
      );

      if (error) throw error;

      setSelectedPerson(null);
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

  async function saveFunction() {
    if (!activeOrganization) return;

    const name = newFunctionName.trim();
    const count = Math.max(
      1,
      Number.parseInt(
        newFunctionCount.replace(/\D/g, ""),
        10
      ) || 1
    );

    if (name.length < 2) {
      Alert.alert(
        "Nome necessário",
        "Informe a função, por exemplo: Recepção."
      );
      return;
    }

    setSavingFunction(true);

    try {
      const { error } = await supabase.rpc(
        "save_department_function",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
          p_function_id: null,
          p_name: name,
          p_default_required_count: count,
        }
      );

      if (error) throw error;

      setNewFunctionName("");
      setNewFunctionCount("1");
      setShowFunctionForm(false);
      await load();
    } catch (error) {
      Alert.alert(
        "Função não criada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingFunction(false);
    }
  }

  function confirmArchiveFunction(item: DepartmentFunction) {
    Alert.alert(
      "Arquivar função?",
      `${item.function_name} deixará de aparecer em novas escalas. As escalas já criadas não serão apagadas.`,
      [
        { text: "Voltar", style: "cancel" },
        {
          text: "Arquivar",
          style: "destructive",
          onPress: () => void archiveFunction(item),
        },
      ]
    );
  }

  async function archiveFunction(item: DepartmentFunction) {
    if (!activeOrganization) return;

    try {
      const { error } = await supabase.rpc(
        "archive_department_function",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
          p_function_id: item.function_id,
        }
      );

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Função não arquivada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    }
  }

  function openMemberFunctions(member: DepartmentMember) {
    const current = functionsByPerson.get(member.person_id) ?? [];

    setSelectedMemberFunctionIds(
      current.map((item) => item.function_id)
    );
    setEditingMemberFunctionsId(member.person_id);
  }

  function toggleMemberFunction(functionId: string) {
    setSelectedMemberFunctionIds((current) =>
      current.includes(functionId)
        ? current.filter((id) => id !== functionId)
        : [...current, functionId]
    );
  }

  async function saveMemberFunctions() {
    if (!activeOrganization || !editingMemberFunctionsId) return;

    setSavingMemberFunctions(true);

    try {
      const { error } = await supabase.rpc(
        "set_department_member_functions",
        {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
          p_person_id: editingMemberFunctionsId,
          p_function_ids: selectedMemberFunctionIds,
        }
      );

      if (error) throw error;

      setEditingMemberFunctionsId(null);
      setSelectedMemberFunctionIds([]);
      await load();
    } catch (error) {
      Alert.alert(
        "Funções não atualizadas",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingMemberFunctions(false);
    }
  }

  return (
    <EloScreen
      title={department.name}
      eyebrow="ELO • DEPARTAMENTO"
      subtitle={
        department.description ||
        "Equipe, funções e liderança deste departamento."
      }
      onBack={onBack}
    >
      <View style={styles.leaderCard}>
        <P.CrownSimpleIcon
          size={19}
          color={eloColors.blue}
          weight="duotone"
        />

        <View style={styles.grow}>
          <Text style={styles.leaderLabel}>
            Líder do departamento
          </Text>
          <Text style={styles.leaderName}>
            {leaderName || "Nenhum líder definido"}
          </Text>
        </View>

        {canManage ? (
          <Pressable
            disabled={savingLeader}
            onPress={() =>
              setShowLeaderPicker((value) => !value)
            }
            style={styles.leaderAction}
          >
            <Text style={styles.leaderActionText}>
              {showLeaderPicker
                ? "Fechar"
                : leaderName
                  ? "Trocar"
                  : "Definir"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {showLeaderPicker ? (
        <EloCard>
          <Text style={eloSharedStyles.cardTitle}>
            Escolher líder
          </Text>

          <TextInput
            value={leaderSearch}
            onChangeText={setLeaderSearch}
            placeholder="Buscar pessoa"
            placeholderTextColor="#A1A9B0"
            style={[styles.input, styles.search]}
          />

          <View style={styles.candidateList}>
            {filteredLeaders.length === 0 ? (
              <Text style={styles.emptyText}>
                Nenhuma pessoa disponível.
              </Text>
            ) : (
              filteredLeaders.map((person) => (
                <Pressable
                  key={person.person_id}
                  disabled={savingLeader}
                  onPress={() => void setLeader(person)}
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

          {leaderName ? (
            <View style={styles.removeLeader}>
              <EloActionButton
                label="Remover liderança"
                variant="secondary"
                loading={savingLeader}
                onPress={() => void setLeader(null)}
              />
            </View>
          ) : null}
        </EloCard>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>
        Funções do departamento
      </Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : activeFunctions.length === 0 ? (
        <EloState
          title="Nenhuma função cadastrada"
          description="Cadastre as funções reais deste departamento. Cada uma pode ter sua própria quantidade de pessoas por culto."
          icon="ListChecksIcon"
        />
      ) : (
        <View style={styles.functionList}>
          {activeFunctions.map((item) => (
            <EloCard key={item.function_id}>
              <View style={styles.functionRow}>
                <View style={styles.functionIcon}>
                  <P.ListChecksIcon
                    size={20}
                    color={eloColors.blue}
                    weight="duotone"
                  />
                </View>

                <View style={styles.grow}>
                  <Text style={eloSharedStyles.cardTitle}>
                    {item.function_name}
                  </Text>
                  <Text style={styles.meta}>
                    {item.default_required_count} pessoa
                    {item.default_required_count === 1 ? "" : "s"} por culto •{" "}
                    {item.qualified_member_count} habilitada
                    {item.qualified_member_count === 1 ? "" : "s"}
                  </Text>
                </View>

                {canManage ? (
                  <Pressable
                    onPress={() => confirmArchiveFunction(item)}
                    style={styles.smallAction}
                  >
                    <P.XIcon
                      size={15}
                      color={eloColors.muted}
                      weight="bold"
                    />
                  </Pressable>
                ) : null}
              </View>
            </EloCard>
          ))}
        </View>
      )}

      {canManage ? (
        <View style={styles.actionGap}>
          <EloActionButton
            label={
              showFunctionForm ? "Fechar função" : "Adicionar função"
            }
            variant={showFunctionForm ? "secondary" : "primary"}
            icon={showFunctionForm ? "XIcon" : "PlusIcon"}
            onPress={() =>
              setShowFunctionForm((value) => !value)
            }
          />
        </View>
      ) : null}

      {showFunctionForm ? (
        <EloCard>
          <Text style={eloSharedStyles.cardTitle}>
            Nova função
          </Text>

          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={newFunctionName}
            onChangeText={setNewFunctionName}
            placeholder="Ex.: Recepção, bateria, projeção"
            placeholderTextColor="#A1A9B0"
            style={styles.input}
          />

          <Text style={styles.label}>
            Pessoas necessárias por culto
          </Text>
          <TextInput
            value={newFunctionCount}
            onChangeText={(value) =>
              setNewFunctionCount(value.replace(/\D/g, ""))
            }
            keyboardType="number-pad"
            style={styles.input}
          />

          <View style={styles.formActions}>
            <EloActionButton
              label="Salvar função"
              icon="CheckIcon"
              loading={savingFunction}
              onPress={() => void saveFunction()}
            />
          </View>
        </EloCard>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>Equipe</Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : activeMembers.length === 0 ? (
        <EloState
          title="Nenhuma pessoa na equipe"
          description={
            canManage
              ? "Adicione pessoas e depois marque em quais funções cada uma pode servir."
              : "A liderança ainda não adicionou pessoas a esta equipe."
          }
          icon="UsersThreeIcon"
        />
      ) : (
        <View style={styles.list}>
          {activeMembers.map((member) => {
            const assignedFunctions =
              functionsByPerson.get(member.person_id) ?? [];
            const editing =
              editingMemberFunctionsId === member.person_id;

            return (
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
                      {member.can_serve
                        ? "Disponível para escala"
                        : "Fora do rodízio"}
                    </Text>
                  </View>

                  {canManage ? (
                    <Pressable
                      onPress={() =>
                        editing
                          ? setEditingMemberFunctionsId(null)
                          : openMemberFunctions(member)
                      }
                      style={styles.memberFunctionAction}
                    >
                      <Text style={styles.memberFunctionActionText}>
                        {editing ? "Fechar" : "Funções"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {assignedFunctions.length > 0 ? (
                  <View style={styles.chips}>
                    {assignedFunctions.map((item) => (
                      <View
                        key={item.function_id}
                        style={styles.chip}
                      >
                        <Text style={styles.chipText}>
                          {item.function_name}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noFunction}>
                    Nenhuma função habilitada
                  </Text>
                )}

                {editing ? (
                  <View style={styles.memberFunctionEditor}>
                    <Text style={styles.editorTitle}>
                      Pode servir em:
                    </Text>

                    {activeFunctions.length === 0 ? (
                      <Text style={styles.emptyText}>
                        Cadastre uma função primeiro.
                      </Text>
                    ) : (
                      <View style={styles.functionChoices}>
                        {activeFunctions.map((item) => {
                          const selected =
                            selectedMemberFunctionIds.includes(
                              item.function_id
                            );

                          return (
                            <Pressable
                              key={item.function_id}
                              onPress={() =>
                                toggleMemberFunction(item.function_id)
                              }
                              style={[
                                styles.functionChoice,
                                selected &&
                                  styles.functionChoiceSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.functionChoiceText,
                                  selected &&
                                    styles.functionChoiceTextSelected,
                                ]}
                              >
                                {item.function_name}
                              </Text>

                              {selected ? (
                                <P.CheckIcon
                                  size={14}
                                  color={eloColors.blue}
                                  weight="bold"
                                />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    <View style={styles.saveMemberFunctions}>
                      <EloActionButton
                        label="Salvar funções"
                        icon="CheckIcon"
                        loading={savingMemberFunctions}
                        disabled={activeFunctions.length === 0}
                        onPress={() =>
                          void saveMemberFunctions()
                        }
                      />
                    </View>
                  </View>
                ) : null}
              </EloCard>
            );
          })}
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

              <Text style={styles.memberAddHint}>
                Depois de adicionar, escolha as funções que esta
                pessoa pode exercer.
              </Text>

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
            Como criar a escala
          </Text>

          <EloCard>
            <View style={styles.scheduleInfo}>
              <View style={styles.scheduleIcon}>
                <P.CalendarCheckIcon
                  size={22}
                  color={eloColors.blue}
                  weight="duotone"
                />
              </View>

              <View style={styles.grow}>
                <Text style={eloSharedStyles.cardTitle}>
                  Funções viram a estrutura da escala
                </Text>
                <Text style={eloSharedStyles.cardText}>
                  Na Agenda, abra a data do culto e escolha
                  “Escala deste culto”. O Elo usa as funções e
                  quantidades deste departamento, selecionando
                  somente pessoas habilitadas em cada função.
                </Text>
              </View>
            </View>
          </EloCard>
        </>
      ) : null}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  leaderCard: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "#EAF5FB",
  },
  leaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  leaderName: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  leaderAction: {
    minHeight: 36,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  leaderActionText: {
    fontSize: 10,
    fontWeight: "900",
    color: eloColors.blue,
  },
  removeLeader: {
    marginTop: 12,
  },
  loading: {
    paddingVertical: 36,
    alignItems: "center",
  },
  functionList: {
    gap: 9,
  },
  functionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  functionIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  smallAction: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#F2F4F6",
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
  meta: {
    marginTop: 4,
    fontSize: 11,
    color: eloColors.muted,
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
  memberFunctionAction: {
    minHeight: 34,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: eloColors.surfaceSoft,
  },
  memberFunctionActionText: {
    fontSize: 10,
    fontWeight: "900",
    color: eloColors.blue,
  },
  chips: {
    marginTop: 11,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EAF5FB",
  },
  chipText: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.blue,
  },
  noFunction: {
    marginTop: 10,
    fontSize: 10,
    fontStyle: "italic",
    color: eloColors.muted,
  },
  memberFunctionEditor: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: eloColors.line,
  },
  editorTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.ink,
  },
  functionChoices: {
    marginTop: 9,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  functionChoice: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  functionChoiceSelected: {
    borderColor: "#8CC5E8",
    backgroundColor: "#F2F9FD",
  },
  functionChoiceText: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  functionChoiceTextSelected: {
    color: eloColors.blue,
  },
  saveMemberFunctions: {
    marginTop: 12,
  },
  memberAddHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 17,
    color: eloColors.muted,
  },
  scheduleInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  scheduleIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
});
