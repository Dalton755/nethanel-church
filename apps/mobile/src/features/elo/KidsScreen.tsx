import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
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
  active_checkin:
    | {
        checkin_id: string;
        event_id: string;
        room_id: string;
        room_name: string | null;
        checked_in_at: string;
        status: string;
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
};

type RoomStatus = {
  room_id: string;
  name: string;
  capacity: number;
  active_children: number;
  remaining: number;
  min_staff: number;
  staff_present: number;
  staffing_ok: boolean;
  capacity_ok: boolean;
};

type QrPayload = {
  token?: string;
  expires_at?: string;
  child_name?: string;
  event_title?: string;
  recommended_room_name?: string;
  room_name?: string;
};

export function KidsScreen({ onBack }: { onBack: () => void }) {
  const {
    activeOrganization,
    activeUnit,
    can,
    canAtOrganization,
  } = useOrganization();

  const [kids, setKids] = useState<Kid[]>([]);
  const [nextEvent, setNextEvent] = useState<EventLite | null>(null);
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<QrPayload | null>(null);

  const canManageKids =
    can("kids.manage") ||
    canAtOrganization("kids.manage");

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setKids([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [kidsResponse, eventResponse] = await Promise.all([
        supabase.rpc("list_my_kids", {
          p_organization_id: activeOrganization.id,
        }),

        supabase
          .from("events")
          .select("id,title,starts_at")
          .eq("organization_id", activeOrganization.id)
          .eq("unit_id", activeUnit.id)
          .eq("status", "published")
          .gte("starts_at", new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString())
          .order("starts_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (kidsResponse.error) throw kidsResponse.error;
      if (eventResponse.error) throw eventResponse.error;

      const nextKids = Array.isArray(kidsResponse.data)
        ? (kidsResponse.data as Kid[])
        : [];
      setKids(nextKids);
      setNextEvent((eventResponse.data ?? null) as EventLite | null);

      if (canManageKids && eventResponse.data) {
        const { data, error } = await supabase.rpc("list_kids_rooms_status", {
          p_organization_id: activeOrganization.id,
          p_unit_id: activeUnit.id,
          p_event_id: eventResponse.data.id,
        });

        if (!error) {
          setRooms((data ?? []) as RoomStatus[]);
        }
      } else {
        setRooms([]);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível carregar o Elo Kids."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit, canManageKids]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issueCheckin(kid: Kid) {
    if (!nextEvent) {
      Alert.alert("Sem culto ou evento", "Não há evento disponível para check-in agora.");
      return;
    }

    setWorkingId(kid.child_person_id);

    try {
      const { data, error } = await supabase.rpc("issue_my_kid_checkin_qr", {
        p_child_person_id: kid.child_person_id,
        p_event_id: nextEvent.id,
      });

      if (error) throw error;
      setQr((data ?? null) as QrPayload | null);
    } catch (error) {
      Alert.alert(
        "Check-in Kids indisponível",
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
        "QR de retirada indisponível",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function acknowledgeCall(kid: Kid) {
    if (!kid.guardian_call) return;

    setWorkingId(kid.child_person_id);

    try {
      const { error } = await supabase.rpc("acknowledge_kid_guardian_call", {
        p_call_id: kid.guardian_call.call_id,
      });

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Não foi possível confirmar",
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
        subtitle="Check-in, retirada segura e visão das salas no mesmo fluxo."
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
            {kids.length > 0 ? (
              <>
                <Text style={eloSharedStyles.sectionTitle}>Minha família</Text>
                <View style={styles.list}>
                  {kids.map((kid) => {
                    const busy = workingId === kid.child_person_id;
                    const displayName = kid.preferred_name || kid.name;

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

                          <View style={styles.kidCopy}>
                            <Text style={eloSharedStyles.cardTitle}>{displayName}</Text>
                            <Text style={styles.kidMeta}>
                              {kid.active_checkin?.room_name ||
                                kid.default_room_name ||
                                "Sala definida no momento do check-in"}
                            </Text>
                          </View>
                        </View>

                        {kid.guardian_call ? (
                          <View style={styles.callBox}>
                            <P.BellRingingIcon
                              size={19}
                              color={eloColors.danger}
                              weight="fill"
                            />
                            <View style={styles.callCopy}>
                              <Text style={styles.callTitle}>
                                A equipe Kids está chamando você
                              </Text>
                              <Text style={styles.callText}>
                                Confirme que recebeu o chamado e dirija-se à sala.
                              </Text>
                            </View>
                          </View>
                        ) : null}

                        {kid.active_checkin ? (
                          <View style={styles.activeBox}>
                            <P.CheckCircleIcon
                              size={18}
                              color={eloColors.green}
                              weight="fill"
                            />
                            <Text style={styles.activeText}>
                              Presente no Elo Kids • {kid.active_checkin.room_name}
                            </Text>
                          </View>
                        ) : null}

                        <View style={styles.actions}>
                          {kid.guardian_call ? (
                            <View style={styles.flexButton}>
                              <EloActionButton
                                label="Recebi o chamado"
                                loading={busy}
                                onPress={() => void acknowledgeCall(kid)}
                              />
                            </View>
                          ) : null}

                          {!kid.active_checkin && kid.can_checkin ? (
                            <View style={styles.flexButton}>
                              <EloActionButton
                                label="QR de entrada"
                                icon="QrCodeIcon"
                                loading={busy}
                                onPress={() => void issueCheckin(kid)}
                              />
                            </View>
                          ) : null}

                          {kid.active_checkin && kid.can_pickup ? (
                            <View style={styles.flexButton}>
                              <EloActionButton
                                label="QR de retirada"
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
              </>
            ) : (
              <View style={styles.stateWrap}>
                <EloState
                  title="Nenhuma criança vinculada"
                  description="Quando uma criança estiver vinculada a você como responsável, ela aparecerá aqui."
                  icon="BabyIcon"
                />
              </View>
            )}

            {canManageKids ? (
              <>
                <Text style={eloSharedStyles.sectionTitle}>Operação das salas</Text>

                {rooms.length === 0 ? (
                  <EloState
                    title="Sem operação ativa"
                    description="Quando houver culto ou evento em janela de operação, o status das salas aparecerá aqui."
                    icon="UsersIcon"
                  />
                ) : (
                  <View style={styles.list}>
                    {rooms.map((room) => (
                      <EloCard key={room.room_id}>
                        <View style={styles.roomHeader}>
                          <View style={styles.roomCopy}>
                            <Text style={eloSharedStyles.cardTitle}>{room.name}</Text>
                            <Text style={styles.roomMeta}>
                              {room.active_children}/{room.capacity} crianças • {room.staff_present} equipe
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.roomStatus,
                              room.capacity_ok && room.staffing_ok
                                ? styles.roomStatusGood
                                : styles.roomStatusAttention,
                            ]}
                          >
                            <Text
                              style={[
                                styles.roomStatusText,
                                room.capacity_ok && room.staffing_ok
                                  ? styles.roomStatusTextGood
                                  : styles.roomStatusTextAttention,
                              ]}
                            >
                              {room.capacity_ok && room.staffing_ok ? "OK" : "Atenção"}
                            </Text>
                          </View>
                        </View>
                      </EloCard>
                    ))}
                  </View>
                )}
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
            ? `Sala sugerida: ${qr.recommended_room_name}`
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
  loading: {
    paddingVertical: 44,
    alignItems: "center",
  },
  stateWrap: {
    marginTop: 22,
  },
  list: {
    gap: 10,
  },
  kidHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  kidIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#EDF8F0",
  },
  kidCopy: {
    flex: 1,
  },
  kidMeta: {
    marginTop: 3,
    fontSize: 12,
    color: eloColors.muted,
  },
  callBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: eloColors.dangerSoft,
  },
  callCopy: {
    flex: 1,
  },
  callTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.danger,
  },
  callText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: "#7E5757",
  },
  activeBox: {
    marginTop: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  activeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: eloColors.green,
  },
  actions: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  flexButton: {
    flexGrow: 1,
    flexBasis: 150,
  },
  roomHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  roomCopy: {
    flex: 1,
  },
  roomMeta: {
    marginTop: 4,
    fontSize: 12,
    color: eloColors.muted,
  },
  roomStatus: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  roomStatusGood: {
    backgroundColor: eloColors.successSoft,
  },
  roomStatusAttention: {
    backgroundColor: "#FFF5E5",
  },
  roomStatusText: {
    fontSize: 10,
    fontWeight: "900",
  },
  roomStatusTextGood: {
    color: eloColors.green,
  },
  roomStatusTextAttention: {
    color: eloColors.yellow,
  },
});
