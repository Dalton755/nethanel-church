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
  EloQrModal,
  EloScreen,
  EloState,
  eloColors,
  eloSharedStyles,
} from "./EloUi";

const P = Phosphor as any;

type KidsAccess = {
  premium?: boolean;
  parent?: boolean;
  staff?: boolean;
  staff_role?: "LEADER" | "VOLUNTEER" | null;
  manage?: boolean;
  lead?: boolean;
};

type Kid = {
  child_person_id: string;
  name: string;
  preferred_name: string | null;
  birth_date: string | null;
  relationship: string | null;
  can_checkin: boolean;
  can_pickup: boolean;
  default_room_id: string | null;
  default_room_name: string | null;
  allergies?: string | null;
  medical_notes?: string | null;
  emergency_notes?: string | null;
  active_checkin:
    | {
        checkin_id: string;
        event_id: string;
        room_id: string;
        room_name: string | null;
        checked_in_at: string;
        status: "WAITING_ROOM" | "ACTIVE";
        room_released?: boolean;
        pickup_released?: boolean;
      }
    | null;
  guardian_call:
    | {
        call_id: string;
        status: string;
        requested_at: string;
      }
    | null;
};

type EventLite = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
};

type Operation = {
  event_id?: string;
  event_title?: string;
  starts_at?: string;
  ends_at?: string | null;
  room_released?: boolean;
  room_released_at?: string | null;
  pickup_released?: boolean;
  pickup_released_at?: string | null;
  closed?: boolean;
};

type RoomStatus = {
  room_id: string;
  name: string;
  min_age_months: number;
  max_age_months: number;
  capacity: number;
  active_children: number;
  remaining: number;
  min_staff: number;
  staff_present: number;
  staffing_ok: boolean;
  capacity_ok: boolean;
};

type StaffMember = {
  staff_id: string;
  person_id: string;
  name: string;
  staff_role: "LEADER" | "VOLUNTEER";
  phone: string | null;
  active: boolean;
};

type Candidate = {
  person_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  current_staff_role: "LEADER" | "VOLUNTEER" | null;
};

type ScheduleAssignment = {
  assignment_id: string;
  person_id: string;
  person_name: string;
  status: string;
  role_label: string;
};

type TeamChild = {
  checkin_id: string;
  child_person_id: string;
  child_name: string;
  birth_date: string | null;
  room_id: string;
  room_name: string;
  checked_in_at: string;
  allergies: string | null;
  medical_notes: string | null;
  emergency_notes: string | null;
  guardians: Array<{
    person_id: string;
    name: string;
    phone: string | null;
    relationship: string;
    can_pickup: boolean;
    is_primary: boolean;
  }>;
  guardian_call_status: string | null;
};

type QrPayload = {
  token?: string;
  expires_at?: string;
  child_name?: string;
  recommended_room_name?: string;
  room_name?: string;
};

function parseBrDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function formatEvent(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function ageRange(room: RoomStatus) {
  const min = Math.floor(room.min_age_months / 12);
  const max = Math.floor(room.max_age_months / 12);
  return `${min}–${max} anos`;
}

export function KidsScreen({ onBack }: { onBack: () => void }) {
  const {
    activeOrganization,
    activeUnit,
    can,
    canAtOrganization,
  } = useOrganization();

  const adminKids =
    can("kids.manage") || canAtOrganization("kids.manage");

  const [kids, setKids] = useState<Kid[]>([]);
  const [access, setAccess] = useState<KidsAccess>({});
  const [nextEvent, setNextEvent] = useState<EventLite | null>(null);
  const [operation, setOperation] = useState<Operation>({});
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [schedule, setSchedule] = useState<ScheduleAssignment[]>([]);
  const [teamChildren, setTeamChildren] = useState<TeamChild[]>([]);

  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<QrPayload | null>(null);

  const [showChildForm, setShowChildForm] = useState(false);
  const [childName, setChildName] = useState("");
  const [childBirthDate, setChildBirthDate] = useState("");
  const [childRelationship, setChildRelationship] = useState("Pai/Mãe");
  const [childAllergies, setChildAllergies] = useState("");
  const [childMedical, setChildMedical] = useState("");
  const [childEmergency, setChildEmergency] = useState("");

  const [showTeamSetup, setShowTeamSetup] = useState(false);
  const [requiredCount, setRequiredCount] = useState("2");

  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomName, setRoomName] = useState("Sala Kids");
  const [roomMinAge, setRoomMinAge] = useState("0");
  const [roomMaxAge, setRoomMaxAge] = useState("9");
  const [roomCapacity, setRoomCapacity] = useState("20");
  const [roomMinStaff, setRoomMinStaff] = useState("2");

  const leader = useMemo(
    () => staff.find((item) => item.staff_role === "LEADER") ?? null,
    [staff]
  );

  const confirmedCount = useMemo(
    () => schedule.filter((item) => item.status === "confirmed").length,
    [schedule]
  );

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [kidsResponse, accessResponse, eventResponse] =
        await Promise.all([
          supabase.rpc("list_my_kids", {
            p_organization_id: activeOrganization.id,
          }),
          supabase.rpc("get_my_kids_access", {
            p_organization_id: activeOrganization.id,
            p_unit_id: activeUnit.id,
          }),
          supabase
            .from("events")
            .select("id,title,starts_at,ends_at")
            .eq("organization_id", activeOrganization.id)
            .eq("unit_id", activeUnit.id)
            .eq("status", "published")
            .gte(
              "starts_at",
              new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
            )
            .order("starts_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

      if (kidsResponse.error) throw kidsResponse.error;
      if (accessResponse.error) throw accessResponse.error;
      if (eventResponse.error) throw eventResponse.error;

      const nextKids = Array.isArray(kidsResponse.data)
        ? (kidsResponse.data as Kid[])
        : [];
      const nextAccess = (accessResponse.data ?? {}) as KidsAccess;
      const event = (eventResponse.data ?? null) as EventLite | null;

      setKids(nextKids);
      setAccess(nextAccess);
      setNextEvent(event);

      if (!event) {
        setOperation({});
        setRooms([]);
        setSchedule([]);
        setTeamChildren([]);
      } else {
        const requests: Promise<any>[] = [
          supabase.rpc("get_kids_event_operation", {
            p_organization_id: activeOrganization.id,
            p_unit_id: activeUnit.id,
            p_event_id: event.id,
          }),
        ];

        if (nextAccess.manage || nextAccess.lead) {
          requests.push(
            supabase.rpc("list_kids_rooms_status", {
              p_organization_id: activeOrganization.id,
              p_unit_id: activeUnit.id,
              p_event_id: event.id,
            }),
            supabase.rpc("list_kids_team_roster", {
              p_organization_id: activeOrganization.id,
              p_unit_id: activeUnit.id,
              p_event_id: event.id,
            }),
            supabase.rpc("list_kids_event_schedule", {
              p_organization_id: activeOrganization.id,
              p_unit_id: activeUnit.id,
              p_event_id: event.id,
            })
          );
        }

        const responses = await Promise.all(requests);
        if (responses[0].error) throw responses[0].error;
        setOperation((responses[0].data ?? {}) as Operation);

        if (nextAccess.manage || nextAccess.lead) {
          setRooms((responses[1].data ?? []) as RoomStatus[]);
          setTeamChildren((responses[2].data ?? []) as TeamChild[]);
          setSchedule((responses[3].data ?? []) as ScheduleAssignment[]);
        }
      }

      if (nextAccess.lead || adminKids) {
        const [staffResponse, candidatesResponse] = await Promise.all([
          supabase.rpc("list_kids_staff", {
            p_organization_id: activeOrganization.id,
            p_unit_id: activeUnit.id,
          }),
          supabase.rpc("list_kids_people_candidates", {
            p_organization_id: activeOrganization.id,
            p_unit_id: activeUnit.id,
          }),
        ]);

        if (!staffResponse.error) {
          setStaff((staffResponse.data ?? []) as StaffMember[]);
        }
        if (!candidatesResponse.error) {
          setCandidates((candidatesResponse.data ?? []) as Candidate[]);
        }
      } else {
        setStaff([]);
        setCandidates([]);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o Elo Kids."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit, adminKids]);

  useEffect(() => {
    void load();
  }, [load]);

  async function registerChild() {
    if (!activeOrganization || !activeUnit) return;

    const birthDate = parseBrDate(childBirthDate);
    if (!birthDate) {
      Alert.alert("Data inválida", "Use o formato dd/mm/aaaa.");
      return;
    }

    setWorkingId("child-form");

    try {
      const { error } = await supabase.rpc("register_my_child", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_full_name: childName.trim(),
        p_birth_date: birthDate,
        p_relationship: childRelationship.trim() || "Responsável",
        p_allergies: childAllergies.trim() || null,
        p_medical_notes: childMedical.trim() || null,
        p_emergency_notes: childEmergency.trim() || null,
      });

      if (error) throw error;

      setChildName("");
      setChildBirthDate("");
      setChildAllergies("");
      setChildMedical("");
      setChildEmergency("");
      setShowChildForm(false);
      await load();
    } catch (error) {
      Alert.alert(
        "Cadastro não concluído",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function checkinArrival(kid: Kid) {
    if (!activeOrganization || !activeUnit || !nextEvent) {
      Alert.alert(
        "Check-in indisponível",
        "O check-in aparece no dia do culto."
      );
      return;
    }

    setWorkingId(kid.child_person_id);

    try {
      const { error } = await supabase.rpc("checkin_my_child_arrival", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_event_id: nextEvent.id,
        p_child_person_id: kid.child_person_id,
      });

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Check-in indisponível",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function issueRoomEntry(kid: Kid) {
    if (!kid.active_checkin) return;

    setWorkingId(kid.child_person_id);
    try {
      const { data, error } = await supabase.rpc(
        "issue_my_kid_room_entry_qr",
        {
          p_checkin_id: kid.active_checkin.checkin_id,
        }
      );
      if (error) throw error;
      setQr((data ?? null) as QrPayload | null);
    } catch (error) {
      Alert.alert(
        "Entrada ainda indisponível",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function issuePickup(kid: Kid) {
    if (!kid.active_checkin) return;

    setWorkingId(kid.child_person_id);
    try {
      const { data, error } = await supabase.rpc("issue_my_kid_pickup_qr", {
        p_checkin_id: kid.active_checkin.checkin_id,
      });
      if (error) throw error;
      setQr((data ?? null) as QrPayload | null);
    } catch (error) {
      Alert.alert(
        "Retirada ainda indisponível",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function saveStaff(personId: string, role: "LEADER" | "VOLUNTEER") {
    if (!activeOrganization || !activeUnit) return;

    setWorkingId(personId);
    try {
      const { error } = await supabase.rpc("add_kids_staff_member", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_person_id: personId,
        p_staff_role: role,
      });
      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Equipe Kids",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function removeStaff(personId: string) {
    if (!activeOrganization || !activeUnit) return;
    setWorkingId(personId);
    try {
      const { error } = await supabase.rpc("remove_kids_staff_member", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_person_id: personId,
      });
      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Equipe Kids",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function generateSchedule() {
    if (!activeOrganization || !activeUnit || !nextEvent) return;

    const count = Number(requiredCount);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      Alert.alert("Quantidade inválida", "Informe entre 1 e 50 pessoas.");
      return;
    }

    setWorkingId("schedule");
    try {
      const { error } = await supabase.rpc("save_kids_event_schedule", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_event_id: nextEvent.id,
        p_required_count: count,
      });
      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Escala Kids",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function createRoom() {
    if (!activeOrganization || !activeUnit) return;

    const minAge = Number(roomMinAge);
    const maxAge = Number(roomMaxAge);
    const capacity = Number(roomCapacity);
    const minStaff = Number(roomMinStaff);

    setWorkingId("room-form");
    try {
      const { error } = await supabase.rpc("create_kids_room", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_name: roomName.trim(),
        p_min_age_months: minAge * 12,
        p_max_age_months: Math.min(119, maxAge * 12 + 11),
        p_capacity: capacity,
        p_min_staff: minStaff,
        p_department_id: null,
      });
      if (error) throw error;
      setShowRoomForm(false);
      await load();
    } catch (error) {
      Alert.alert(
        "Sala Kids",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function enterRoom(roomId: string) {
    if (!nextEvent) return;
    setWorkingId(roomId);
    try {
      const { error } = await supabase.rpc("kids_staff_enter_room", {
        p_room_id: roomId,
        p_event_id: nextEvent.id,
      });
      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Presença na sala",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function releaseRoom() {
    if (!activeOrganization || !activeUnit || !nextEvent) return;
    setWorkingId("release-room");
    try {
      const { data, error } = await supabase.rpc("release_kids_room", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_event_id: nextEvent.id,
      });
      if (error) throw error;
      await load();
      const result = (data ?? {}) as { notified_guardians?: number };
      Alert.alert(
        "Sala liberada",
        `${result.notified_guardians ?? 0} responsável(is) foram avisados.`
      );
    } catch (error) {
      Alert.alert(
        "Não foi possível liberar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function releasePickup() {
    if (!activeOrganization || !activeUnit || !nextEvent) return;
    setWorkingId("release-pickup");
    try {
      const { data, error } = await supabase.rpc("release_kids_pickup", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_event_id: nextEvent.id,
      });
      if (error) throw error;
      await load();
      const result = (data ?? {}) as { notified_guardians?: number };
      Alert.alert(
        "Retirada liberada",
        `${result.notified_guardians ?? 0} responsável(is) foram avisados.`
      );
    } catch (error) {
      Alert.alert(
        "Não foi possível liberar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function callGuardian(child: TeamChild) {
    setWorkingId(child.checkin_id);
    try {
      const { data, error } = await supabase.rpc("call_kid_guardian", {
        p_checkin_id: child.checkin_id,
        p_guardian_person_id: null,
      });
      if (error) throw error;
      const result = (data ?? {}) as { guardian_name?: string };
      Alert.alert(
        "Responsável chamado",
        `${result.guardian_name ?? "O responsável"} recebeu o chamado.`
      );
      await load();
    } catch (error) {
      Alert.alert(
        "Chamado não enviado",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      <EloScreen
        title="Elo Kids"
        eyebrow="CUIDADO • SEGURANÇA"
        subtitle="Família, equipe e operação do culto em um único fluxo."
        onBack={onBack}
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : errorMessage ? (
          <EloState
            title="Elo Kids indisponível"
            description={errorMessage}
            icon="WarningCircleIcon"
          />
        ) : (
          <>
            {nextEvent ? (
              <View style={styles.eventContext}>
                <P.CalendarCheckIcon
                  size={20}
                  color={eloColors.blue}
                  weight="duotone"
                />
                <View style={styles.grow}>
                  <Text style={styles.eventTitle}>{nextEvent.title}</Text>
                  <Text style={styles.eventMeta}>
                    {formatEvent(nextEvent.starts_at)}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={eloSharedStyles.sectionTitle}>Minha família</Text>

            <View style={styles.sectionAction}>
              <EloActionButton
                label={showChildForm ? "Fechar cadastro" : "Cadastrar filho"}
                icon={showChildForm ? "XIcon" : "PlusIcon"}
                variant={showChildForm ? "secondary" : "primary"}
                onPress={() => setShowChildForm((value) => !value)}
              />
            </View>

            {showChildForm ? (
              <EloCard>
                <Text style={eloSharedStyles.cardTitle}>
                  Cadastrar criança
                </Text>
                <Text style={eloSharedStyles.cardText}>
                  Para filhos menores de 10 anos.
                </Text>

                <Text style={styles.label}>Nome completo</Text>
                <TextInput
                  value={childName}
                  onChangeText={setChildName}
                  style={styles.input}
                  placeholder="Nome da criança"
                  placeholderTextColor="#A1A9B0"
                />

                <Text style={styles.label}>Nascimento</Text>
                <TextInput
                  value={childBirthDate}
                  onChangeText={setChildBirthDate}
                  style={styles.input}
                  placeholder="dd/mm/aaaa"
                  placeholderTextColor="#A1A9B0"
                  keyboardType="number-pad"
                />

                <Text style={styles.label}>Seu vínculo</Text>
                <TextInput
                  value={childRelationship}
                  onChangeText={setChildRelationship}
                  style={styles.input}
                  placeholder="Pai, mãe ou responsável"
                  placeholderTextColor="#A1A9B0"
                />

                <Text style={styles.label}>Alergias</Text>
                <TextInput
                  value={childAllergies}
                  onChangeText={setChildAllergies}
                  style={styles.input}
                  placeholder="Se houver"
                  placeholderTextColor="#A1A9B0"
                />

                <Text style={styles.label}>Observações médicas</Text>
                <TextInput
                  value={childMedical}
                  onChangeText={setChildMedical}
                  style={styles.input}
                  placeholder="Medicamentos, restrições..."
                  placeholderTextColor="#A1A9B0"
                />

                <Text style={styles.label}>Orientação de emergência</Text>
                <TextInput
                  value={childEmergency}
                  onChangeText={setChildEmergency}
                  style={[styles.input, styles.textarea]}
                  multiline
                  placeholder="O que a equipe precisa saber"
                  placeholderTextColor="#A1A9B0"
                />

                <View style={styles.formAction}>
                  <EloActionButton
                    label="Salvar criança"
                    loading={workingId === "child-form"}
                    onPress={() => void registerChild()}
                  />
                </View>
              </EloCard>
            ) : null}

            {kids.length === 0 ? (
              <EloState
                title="Nenhuma criança cadastrada"
                description="Cadastre seu filho para usar o check-in do Elo Kids."
                icon="BabyIcon"
              />
            ) : (
              <View style={styles.list}>
                {kids.map((kid) => {
                  const displayName = kid.preferred_name || kid.name;
                  const checkin = kid.active_checkin;
                  const busy = workingId === kid.child_person_id;

                  return (
                    <EloCard key={kid.child_person_id}>
                      <View style={styles.kidHeader}>
                        <View style={styles.kidIcon}>
                          <P.BabyIcon
                            size={23}
                            color={eloColors.green}
                            weight="duotone"
                          />
                        </View>
                        <View style={styles.grow}>
                          <Text style={eloSharedStyles.cardTitle}>
                            {displayName}
                          </Text>
                          <Text style={styles.kidMeta}>
                            {kid.default_room_name ??
                              "Sala definida pela faixa etária"}
                          </Text>
                        </View>
                      </View>

                      {!checkin ? (
                        <View style={styles.kidStatusNeutral}>
                          <Text style={styles.kidStatusNeutralText}>
                            Ainda não fez check-in neste culto.
                          </Text>
                        </View>
                      ) : checkin.status === "WAITING_ROOM" ? (
                        <View
                          style={[
                            styles.kidStatusBox,
                            checkin.room_released && styles.kidStatusOpen,
                          ]}
                        >
                          <P.CheckCircleIcon
                            size={18}
                            color={
                              checkin.room_released
                                ? eloColors.green
                                : eloColors.blue
                            }
                            weight="fill"
                          />
                          <Text style={styles.kidStatusText}>
                            {checkin.room_released
                              ? "Sala liberada • leve a criança até a equipe"
                              : "Check-in feito • aguardando a sala ser liberada"}
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.kidStatusBox,
                            checkin.pickup_released &&
                              styles.kidStatusPickup,
                          ]}
                        >
                          <P.ShieldCheckIcon
                            size={18}
                            color={
                              checkin.pickup_released
                                ? "#9A5B00"
                                : eloColors.green
                            }
                            weight="fill"
                          />
                          <Text style={styles.kidStatusText}>
                            {checkin.pickup_released
                              ? "Retirada liberada"
                              : `Na sala • ${checkin.room_name}`}
                          </Text>
                        </View>
                      )}

                      <View style={styles.actions}>
                        {!checkin && kid.can_checkin ? (
                          <View style={styles.flexButton}>
                            <EloActionButton
                              label="Fazer check-in de chegada"
                              icon="CheckCircleIcon"
                              loading={busy}
                              onPress={() => void checkinArrival(kid)}
                            />
                          </View>
                        ) : null}

                        {checkin?.status === "WAITING_ROOM" &&
                        checkin.room_released ? (
                          <View style={styles.flexButton}>
                            <EloActionButton
                              label="QR para entrar na sala"
                              icon="QrCodeIcon"
                              loading={busy}
                              onPress={() => void issueRoomEntry(kid)}
                            />
                          </View>
                        ) : null}

                        {checkin?.status === "ACTIVE" &&
                        checkin.pickup_released &&
                        kid.can_pickup ? (
                          <View style={styles.flexButton}>
                            <EloActionButton
                              label="QR para retirada"
                              icon="QrCodeIcon"
                              loading={busy}
                              onPress={() => void issuePickup(kid)}
                            />
                          </View>
                        ) : null}
                      </View>
                    </EloCard>
                  );
                })}
              </View>
            )}

            {(access.staff || access.manage || access.lead) && nextEvent ? (
              <>
                <Text style={eloSharedStyles.sectionTitle}>
                  Operação do culto
                </Text>

                <View style={styles.operationGrid}>
                  <View style={styles.operationHalf}>
                    <EloActionButton
                      label={
                        operation.room_released
                          ? "Sala já liberada"
                          : "Liberar sala"
                      }
                      icon="DoorOpenIcon"
                      disabled={
                        !access.lead || Boolean(operation.room_released)
                      }
                      loading={workingId === "release-room"}
                      onPress={() => void releaseRoom()}
                    />
                  </View>

                  <View style={styles.operationHalf}>
                    <EloActionButton
                      label={
                        operation.pickup_released
                          ? "Retirada liberada"
                          : "Liberar retirada"
                      }
                      icon="PersonArmsSpreadIcon"
                      variant="secondary"
                      disabled={
                        !access.lead || Boolean(operation.pickup_released)
                      }
                      loading={workingId === "release-pickup"}
                      onPress={() => void releasePickup()}
                    />
                  </View>
                </View>

                <View style={styles.list}>
                  {rooms.map((room) => (
                    <EloCard key={room.room_id}>
                      <View style={styles.roomHeader}>
                        <View style={styles.grow}>
                          <Text style={eloSharedStyles.cardTitle}>
                            {room.name}
                          </Text>
                          <Text style={styles.roomMeta}>
                            {ageRange(room)} • {room.active_children}/
                            {room.capacity} crianças • {room.staff_present}/
                            {room.min_staff} equipe
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.roomPill,
                            room.staffing_ok && room.capacity_ok
                              ? styles.roomPillGood
                              : styles.roomPillAttention,
                          ]}
                        >
                          <Text style={styles.roomPillText}>
                            {room.staffing_ok && room.capacity_ok
                              ? "Pronta"
                              : "Atenção"}
                          </Text>
                        </View>
                      </View>

                      {access.staff ? (
                        <View style={styles.roomAction}>
                          <EloActionButton
                            label="Estou nesta sala"
                            variant="secondary"
                            loading={workingId === room.room_id}
                            onPress={() => void enterRoom(room.room_id)}
                          />
                        </View>
                      ) : null}
                    </EloCard>
                  ))}
                </View>

                {teamChildren.length > 0 ? (
                  <>
                    <Text style={eloSharedStyles.sectionTitle}>
                      Crianças na sala
                    </Text>

                    <View style={styles.list}>
                      {teamChildren.map((child) => (
                        <EloCard key={child.checkin_id}>
                          <View style={styles.childOpsRow}>
                            <View style={styles.grow}>
                              <Text style={eloSharedStyles.cardTitle}>
                                {child.child_name}
                              </Text>
                              <Text style={styles.roomMeta}>
                                {child.room_name}
                              </Text>
                              {child.allergies ? (
                                <Text style={styles.healthAlert}>
                                  Alergia: {child.allergies}
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          <View style={styles.roomAction}>
                            <EloActionButton
                              label={
                                child.guardian_call_status === "SENT"
                                  ? "Responsável chamado"
                                  : "Chamar responsável"
                              }
                              icon="BellRingingIcon"
                              variant="secondary"
                              disabled={
                                child.guardian_call_status === "SENT"
                              }
                              loading={workingId === child.checkin_id}
                              onPress={() => void callGuardian(child)}
                            />
                          </View>
                        </EloCard>
                      ))}
                    </View>
                  </>
                ) : null}
              </>
            ) : null}

            {access.lead || adminKids ? (
              <>
                <Text style={eloSharedStyles.sectionTitle}>
                  Liderança, equipe e escala
                </Text>

                <EloCard>
                  <View style={styles.leaderRow}>
                    <View style={styles.leaderIcon}>
                      <P.CrownIcon
                        size={22}
                        color="#9A5B00"
                        weight="duotone"
                      />
                    </View>
                    <View style={styles.grow}>
                      <Text style={eloSharedStyles.cardTitle}>
                        {leader?.name ?? "Liderança não definida"}
                      </Text>
                      <Text style={styles.roomMeta}>
                        {leader
                          ? "Líder do Elo Kids"
                          : "O ADM ou Pastor define a liderança inicial."}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.roomAction}>
                    <EloActionButton
                      label={
                        showTeamSetup
                          ? "Fechar equipe"
                          : "Configurar equipe"
                      }
                      variant="secondary"
                      onPress={() =>
                        setShowTeamSetup((value) => !value)
                      }
                    />
                  </View>
                </EloCard>

                {showTeamSetup ? (
                  <>
                    <EloCard>
                      <Text style={eloSharedStyles.cardTitle}>
                        Equipe atual
                      </Text>

                      <View style={styles.compactList}>
                        {staff.map((member) => (
                          <View
                            key={member.person_id}
                            style={styles.staffRow}
                          >
                            <View style={styles.grow}>
                              <Text style={styles.staffName}>
                                {member.name}
                              </Text>
                              <Text style={styles.staffRole}>
                                {member.staff_role === "LEADER"
                                  ? "Líder"
                                  : "Voluntário"}
                              </Text>
                            </View>

                            {member.staff_role !== "LEADER" ? (
                              <Pressable
                                onPress={() =>
                                  void removeStaff(member.person_id)
                                }
                                style={styles.removeButton}
                              >
                                <P.TrashIcon
                                  size={16}
                                  color={eloColors.danger}
                                  weight="duotone"
                                />
                              </Pressable>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    </EloCard>

                    <EloCard>
                      <Text style={eloSharedStyles.cardTitle}>
                        Adicionar pessoas
                      </Text>

                      <View style={styles.compactList}>
                        {candidates.slice(0, 30).map((person) => (
                          <View
                            key={person.person_id}
                            style={styles.candidateRow}
                          >
                            <View style={styles.grow}>
                              <Text style={styles.staffName}>
                                {person.name}
                              </Text>
                              <Text style={styles.staffRole}>
                                {person.current_staff_role
                                  ? person.current_staff_role === "LEADER"
                                    ? "Líder atual"
                                    : "Já está na equipe"
                                  : "Disponível"}
                              </Text>
                            </View>

                            {!person.current_staff_role ? (
                              <Pressable
                                disabled={workingId === person.person_id}
                                onPress={() =>
                                  void saveStaff(
                                    person.person_id,
                                    "VOLUNTEER"
                                  )
                                }
                                style={styles.addButton}
                              >
                                <P.PlusIcon
                                  size={16}
                                  color={eloColors.blue}
                                  weight="bold"
                                />
                              </Pressable>
                            ) : null}

                            {adminKids &&
                            person.current_staff_role !== "LEADER" ? (
                              <Pressable
                                disabled={workingId === person.person_id}
                                onPress={() =>
                                  void saveStaff(
                                    person.person_id,
                                    "LEADER"
                                  )
                                }
                                style={styles.leaderButton}
                              >
                                <P.CrownIcon
                                  size={16}
                                  color="#9A5B00"
                                  weight="duotone"
                                />
                              </Pressable>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    </EloCard>
                  </>
                ) : null}

                {nextEvent ? (
                  <EloCard>
                    <Text style={eloSharedStyles.cardTitle}>
                      Escala deste culto
                    </Text>
                    <Text style={eloSharedStyles.cardText}>
                      A escala vale somente para {formatEvent(nextEvent.starts_at)}.
                    </Text>

                    <Text style={styles.label}>Quantidade de pessoas</Text>
                    <TextInput
                      value={requiredCount}
                      onChangeText={setRequiredCount}
                      style={styles.input}
                      keyboardType="number-pad"
                    />

                    <View style={styles.formAction}>
                      <EloActionButton
                        label="Gerar escala Kids"
                        icon="CalendarCheckIcon"
                        loading={workingId === "schedule"}
                        onPress={() => void generateSchedule()}
                      />
                    </View>

                    {schedule.length > 0 ? (
                      <View style={styles.scheduleSummary}>
                        <Text style={styles.scheduleTitle}>
                          {confirmedCount}/{schedule.length} confirmados
                        </Text>
                        {schedule.map((item) => (
                          <View
                            key={item.assignment_id}
                            style={styles.assignmentRow}
                          >
                            <Text style={styles.assignmentName}>
                              {item.person_name}
                            </Text>
                            <Text style={styles.assignmentStatus}>
                              {item.status}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </EloCard>
                ) : null}

                <View style={styles.sectionAction}>
                  <EloActionButton
                    label={showRoomForm ? "Fechar sala" : "Adicionar sala"}
                    variant="secondary"
                    icon={showRoomForm ? "XIcon" : "PlusIcon"}
                    onPress={() => setShowRoomForm((value) => !value)}
                  />
                </View>

                {showRoomForm ? (
                  <EloCard>
                    <Text style={eloSharedStyles.cardTitle}>
                      Nova sala Kids
                    </Text>

                    <Text style={styles.label}>Nome</Text>
                    <TextInput
                      value={roomName}
                      onChangeText={setRoomName}
                      style={styles.input}
                    />

                    <View style={styles.twoColumns}>
                      <View style={styles.column}>
                        <Text style={styles.label}>Idade mínima</Text>
                        <TextInput
                          value={roomMinAge}
                          onChangeText={setRoomMinAge}
                          style={styles.input}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.column}>
                        <Text style={styles.label}>Idade máxima</Text>
                        <TextInput
                          value={roomMaxAge}
                          onChangeText={setRoomMaxAge}
                          style={styles.input}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>

                    <View style={styles.twoColumns}>
                      <View style={styles.column}>
                        <Text style={styles.label}>Capacidade</Text>
                        <TextInput
                          value={roomCapacity}
                          onChangeText={setRoomCapacity}
                          style={styles.input}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.column}>
                        <Text style={styles.label}>Equipe mínima</Text>
                        <TextInput
                          value={roomMinStaff}
                          onChangeText={setRoomMinStaff}
                          style={styles.input}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>

                    <View style={styles.formAction}>
                      <EloActionButton
                        label="Criar sala"
                        loading={workingId === "room-form"}
                        onPress={() => void createRoom()}
                      />
                    </View>
                  </EloCard>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </EloScreen>

      <EloQrModal
        visible={Boolean(qr?.token)}
        title={qr?.child_name ?? "QR Elo Kids"}
        subtitle={
          qr?.recommended_room_name
            ? `Entrada em: ${qr.recommended_room_name}`
            : qr?.room_name
              ? `Retirada em: ${qr.room_name}`
              : "Apresente este QR à equipe Elo Kids."
        }
        token={qr?.token ?? null}
        expiresAt={qr?.expires_at ?? null}
        onClose={() => setQr(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 44, alignItems: "center" },
  grow: { flex: 1 },
  list: { gap: 10 },
  compactList: { marginTop: 12, gap: 8 },
  eventContext: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#EAF5FB",
  },
  eventTitle: { fontSize: 12, fontWeight: "900", color: eloColors.ink },
  eventMeta: { marginTop: 3, fontSize: 10, color: eloColors.muted },
  sectionAction: { marginBottom: 10 },
  label: {
    marginTop: 14,
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
  textarea: { minHeight: 82, paddingTop: 12, textAlignVertical: "top" },
  formAction: { marginTop: 15 },
  kidHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  kidIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#EDF8F0",
  },
  kidMeta: { marginTop: 3, fontSize: 10, color: eloColors.muted },
  kidStatusNeutral: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F3F6F8",
  },
  kidStatusNeutralText: { fontSize: 10, color: eloColors.muted },
  kidStatusBox: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#EAF5FB",
  },
  kidStatusOpen: { backgroundColor: "#ECF8F1" },
  kidStatusPickup: { backgroundColor: "#FFF3D9" },
  kidStatusText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.ink,
  },
  actions: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flexButton: { flexGrow: 1, flexBasis: 150 },
  operationGrid: { flexDirection: "row", gap: 8, marginBottom: 10 },
  operationHalf: { flex: 1 },
  roomHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  roomMeta: { marginTop: 3, fontSize: 10, color: eloColors.muted },
  roomPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
  },
  roomPillGood: { backgroundColor: "#ECF8F1" },
  roomPillAttention: { backgroundColor: "#FFF3D9" },
  roomPillText: { fontSize: 9, fontWeight: "900", color: eloColors.ink },
  roomAction: { marginTop: 12 },
  childOpsRow: { flexDirection: "row", alignItems: "center" },
  healthAlert: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.danger,
  },
  leaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  leaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#FFF3D9",
  },
  staffRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: eloColors.line,
  },
  candidateRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: eloColors.line,
  },
  staffName: { fontSize: 11, fontWeight: "900", color: eloColors.ink },
  staffRole: { marginTop: 3, fontSize: 9, color: eloColors.muted },
  removeButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FFF3F3",
  },
  addButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EAF5FB",
  },
  leaderButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FFF3D9",
  },
  scheduleSummary: {
    marginTop: 14,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#F3F6F8",
  },
  scheduleTitle: {
    marginBottom: 7,
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.ink,
  },
  assignmentRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  assignmentName: { fontSize: 10, fontWeight: "700", color: eloColors.ink },
  assignmentStatus: { fontSize: 9, color: eloColors.muted },
  twoColumns: { flexDirection: "row", gap: 8 },
  column: { flex: 1 },
});
