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
  const [loading, setLoading] = useState(true);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [selectedPerson, setSelectedPerson] =
    useState<PersonCandidate | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [savingMember, setSavingMember] = useState(false);
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

  const memberIds = useMemo(
    () => new Set(activeMembers.map((item) => item.person_id)),
    [activeMembers]
  );

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
      const requests: PromiseLike<any>[] = [
        supabase.rpc("list_department_members", {
          p_organization_id: activeOrganization.id,
          p_department_id: department.id,
        }),
      ];

      if (canManage) {
        requests.push(
          supabase.rpc("list_department_people_candidates", {
            p_organization_id: activeOrganization.id,
            p_unit_id: activeUnit.id,
          })
        );
      }

      const results = await Promise.all(requests);
      const membersResponse = results[0];

      if (membersResponse.error) throw membersResponse.error;

      setMembers(
        (membersResponse.data ?? []) as DepartmentMember[]
      );

      if (results[1]) {
        if (results[1].error) throw results[1].error;
        setCandidates(
          (results[1].data ?? []) as PersonCandidate[]
        );
      } else {
        setCandidates([]);
      }
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
          p_function_name: functionName.trim() || null,
          p_can_serve: true,
        }
      );

      if (error) throw error;

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

  return (
    <EloScreen
      title={department.name}
      eyebrow="ELO • DEPARTAMENTO"
      subtitle={
        department.description ||
        "Equipe e funções deste departamento."
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
            onPress={() => setShowLeaderPicker((value) => !value)}
            style={styles.leaderAction}
          >
            <Text style={styles.leaderActionText}>
              {showLeaderPicker ? "Fechar" : leaderName ? "Trocar" : "Definir"}
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
              ? "Adicione pessoas ao departamento. O Elo usa esta equipe quando você cria uma escala para uma data de culto."
              : "A liderança ainda não adicionou pessoas a esta equipe."
          }
          icon="UsersThreeIcon"
        />
      ) : (
        <View style={styles.list}>
          {activeMembers.map((member) => (
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
                    {member.can_serve
                      ? " • Disponível para escala"
                      : " • Fora do rodízio"}
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

              <Text style={styles.label}>
                Função no departamento
              </Text>

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
            Como criar uma escala
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
                  Escalas agora são por data
                </Text>
                <Text style={eloSharedStyles.cardText}>
                  Abra Agenda, toque no culto desejado e escolha
                  “Escala deste culto”. Mesmo em cultos recorrentes,
                  somente aquela ocorrência recebe a escala.
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
