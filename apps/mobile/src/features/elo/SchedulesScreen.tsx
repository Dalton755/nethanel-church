import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
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

type ScheduleItem = {
  assignment_id: string;
  organization_id: string;
  event_id: string;
  department_id: string;
  department_name: string;
  role_label: string;
  status: string;
  event_title: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  checked_in_at: string | null;
  substitution_request_id: string | null;
  substitution_status: string | null;
  can_checkin: boolean;
};

type QrPayload = {
  token?: string;
  expires_at?: string;
  event_title?: string;
  department_name?: string;
  role_label?: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Confirmada";
    case "declined":
      return "Recusada";
    case "replacement_requested":
      return "Substituição";
    case "completed":
      return "Concluída";
    default:
      return "Aguardando";
  }
}

export function SchedulesScreen({ onBack }: { onBack: () => void }) {
  const {
    activeOrganization,
    can,
    canAtOrganization,
  } = useOrganization();

  const canManage =
    can("schedules.manage") ||
    canAtOrganization("schedules.manage");

  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<QrPayload | null>(null);

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === "pending").length,
    [items]
  );

  const load = useCallback(async () => {
    if (!activeOrganization) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc("list_my_schedule", {
        p_organization_id: activeOrganization.id,
      });

      if (error) throw error;

      const nextItems = ((data ?? []) as ScheduleItem[])
        .filter(
          (item) =>
            new Date(item.starts_at).getTime() >=
            Date.now() - 1000 * 60 * 60 * 12
        )
        .sort(
          (a, b) =>
            new Date(a.starts_at).getTime() -
            new Date(b.starts_at).getTime()
        )
        .slice(0, 50);

      setItems(nextItems);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar suas escalas."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization]);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(
    item: ScheduleItem,
    response: "confirmed" | "declined"
  ) {
    setWorkingId(item.assignment_id);
    setErrorMessage(null);

    try {
      const { error } = await supabase.rpc("respond_my_schedule", {
        p_assignment_id: item.assignment_id,
        p_response: response,
      });

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Não foi possível atualizar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function requestReplacement(item: ScheduleItem) {
    setWorkingId(item.assignment_id);

    try {
      const { error } = await supabase.rpc(
        "request_schedule_substitution",
        {
          p_assignment_id: item.assignment_id,
          p_reason: "Solicitado pelo aplicativo Nethanel Elo",
        }
      );

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Substituição não solicitada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function checkin(item: ScheduleItem) {
    setWorkingId(item.assignment_id);

    try {
      const { error } = await supabase.rpc("checkin_my_schedule", {
        p_assignment_id: item.assignment_id,
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

  async function openQr(item: ScheduleItem) {
    setWorkingId(item.assignment_id);

    try {
      const { data, error } = await supabase.rpc(
        "issue_my_schedule_qr",
        {
          p_assignment_id: item.assignment_id,
        }
      );

      if (error) throw error;
      setQr((data ?? null) as QrPayload | null);
    } catch (error) {
      Alert.alert(
        "QR indisponível",
        error instanceof Error
          ? error.message
          : "O QR abre próximo ao horário da escala."
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      <EloScreen
        title="Minhas escalas"
        eyebrow="ELO • SERVIR"
        subtitle={
          pendingCount > 0
            ? `Você tem ${pendingCount} escala${
                pendingCount > 1 ? "s" : ""
              } aguardando resposta.`
            : "Confirme sua presença, peça substituição ou faça check-in no horário certo."
        }
        onBack={onBack}
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : errorMessage ? (
          <>
            <EloState
              title="Não conseguimos carregar as escalas"
              description={errorMessage}
              icon="WarningCircleIcon"
            />
            <View style={styles.retry}>
              <EloActionButton
                label="Tentar novamente"
                variant="secondary"
                icon="ArrowsClockwiseIcon"
                onPress={() => void load()}
              />
            </View>
          </>
        ) : items.length === 0 ? (
          <>
            <EloState
              title="Nenhuma escala por enquanto"
              description={
                canManage
                  ? "Ainda não há escala para você. Para gerar escalas, volte ao Meu Elo e abra Gestão de escalas."
                  : "Quando você for escalado em um departamento, aparecerá aqui."
              }
              icon="ClipboardTextIcon"
            />
          </>
        ) : (
          <View style={styles.list}>
            {items.map((item) => {
              const busy = workingId === item.assignment_id;

              return (
                <EloCard key={item.assignment_id}>
                  <View style={styles.cardHeader}>
                    <View style={styles.iconWrap}>
                      <P.ClipboardTextIcon
                        size={22}
                        color={eloColors.blue}
                        weight="duotone"
                      />
                    </View>

                    <View style={styles.cardHeaderCopy}>
                      <Text style={eloSharedStyles.cardTitle}>
                        {item.event_title}
                      </Text>
                      <Text style={styles.department}>
                        {item.department_name} • {item.role_label}
                      </Text>
                    </View>

                    <Text style={styles.status}>
                      {statusLabel(item.status)}
                    </Text>
                  </View>

                  <View style={styles.metaRow}>
                    <P.ClockIcon
                      size={16}
                      color={eloColors.muted}
                    />
                    <Text style={styles.meta}>
                      {formatDateTime(item.starts_at)}
                    </Text>
                  </View>

                  {item.location_name ? (
                    <View style={styles.metaRow}>
                      <P.MapPinIcon
                        size={16}
                        color={eloColors.muted}
                      />
                      <Text style={styles.meta}>
                        {item.location_name}
                      </Text>
                    </View>
                  ) : null}

                  {item.checked_in_at ? (
                    <View style={styles.doneRow}>
                      <P.CheckCircleIcon
                        size={17}
                        color={eloColors.green}
                        weight="fill"
                      />
                      <Text style={styles.doneText}>
                        Chegada registrada
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.actions}>
                    {item.status === "pending" ? (
                      <>
                        <View style={styles.half}>
                          <EloActionButton
                            label="Confirmar"
                            icon="CheckIcon"
                            loading={busy}
                            onPress={() =>
                              void respond(item, "confirmed")
                            }
                          />
                        </View>
                        <View style={styles.half}>
                          <EloActionButton
                            label="Não posso"
                            variant="secondary"
                            icon="XIcon"
                            disabled={busy}
                            onPress={() =>
                              void respond(item, "declined")
                            }
                          />
                        </View>
                      </>
                    ) : null}

                    {["confirmed", "replacement_requested"].includes(
                      item.status
                    ) && !item.checked_in_at ? (
                      <>
                        {item.can_checkin ? (
                          <View style={styles.half}>
                            <EloActionButton
                              label="Check-in"
                              icon="CheckCircleIcon"
                              loading={busy}
                              onPress={() => void checkin(item)}
                            />
                          </View>
                        ) : null}

                        <View style={styles.half}>
                          <EloActionButton
                            label="Meu QR"
                            variant="secondary"
                            icon="QrCodeIcon"
                            disabled={busy}
                            onPress={() => void openQr(item)}
                          />
                        </View>
                      </>
                    ) : null}
                  </View>

                  {item.status === "confirmed" &&
                  !item.substitution_request_id &&
                  !item.checked_in_at ? (
                    <Pressable
                      disabled={busy}
                      onPress={() => void requestReplacement(item)}
                      style={styles.textAction}
                    >
                      <P.ArrowsClockwiseIcon
                        size={16}
                        color={eloColors.muted}
                      />
                      <Text style={styles.textActionLabel}>
                        Preciso de substituição
                      </Text>
                    </Pressable>
                  ) : null}
                </EloCard>
              );
            })}
          </View>
        )}
      </EloScreen>

      <EloQrModal
        visible={Boolean(qr?.token)}
        title={qr?.event_title ?? "QR da escala"}
        subtitle={
          qr?.department_name
            ? `${qr.department_name}${
                qr.role_label ? ` • ${qr.role_label}` : ""
              }`
            : "Apresente este QR na chegada."
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
  retry: {
    marginTop: 10,
  },
  list: {
    marginTop: 22,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  cardHeaderCopy: {
    flex: 1,
  },
  department: {
    marginTop: 3,
    fontSize: 12,
    color: eloColors.muted,
  },
  status: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: eloColors.surfaceSoft,
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.blue,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  meta: {
    flex: 1,
    fontSize: 12,
    color: eloColors.muted,
  },
  doneRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  doneText: {
    fontSize: 12,
    fontWeight: "700",
    color: eloColors.green,
  },
  actions: {
    marginTop: 15,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  half: {
    flexGrow: 1,
    flexBasis: 140,
  },
  textAction: {
    marginTop: 14,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  textActionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: eloColors.muted,
  },
});
