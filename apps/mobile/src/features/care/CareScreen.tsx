import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Phosphor from "phosphor-react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloCard,
  EloScreen,
  EloState,
  eloColors,
} from "../elo/EloUi";

const P = Phosphor as any;

type CareScreenProps = {
  onBack: () => void;
};

type PastoralQueueItem = {
  request_id: string;
  person_id: string;
  person_name: string;
  reason: string;
  availability_notes: string | null;
  status: string;
  proposed_start_at: string | null;
  proposed_end_at: string | null;
  proposal_note: string | null;
  member_response_note: string | null;
  created_at: string;
  updated_at: string;
};

type PrayerQueueItem = {
  request_id: string;
  person_id: string;
  person_name: string;
  message: string;
  visibility: string;
  status: string;
  response_text: string | null;
  responded_at: string | null;
  created_at: string;
};

const pastoralStatus: Record<string, string> = {
  REQUESTED: "Nova solicitação",
  PROPOSED: "Aguardando membro",
  CONFIRMED: "Confirmado",
  RESCHEDULE_REQUESTED: "Novo horário solicitado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

const prayerStatus: Record<string, string> = {
  RECEIVED: "Recebido",
  IN_PRAYER: "Em oração",
  ANSWERED: "Respondido",
  CLOSED: "Concluído",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function nextDefaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(19, 0, 0, 0);
  return date;
}

export function CareScreen({ onBack }: CareScreenProps) {
  const { activeOrganization } = useOrganization();

  const [tab, setTab] = useState<"pastoral" | "prayer">("pastoral");
  const [pastoral, setPastoral] = useState<PastoralQueueItem[]>([]);
  const [prayers, setPrayers] = useState<PrayerQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [proposalFor, setProposalFor] = useState<string | null>(null);
  const [proposalDate, setProposalDate] = useState<Date>(nextDefaultDate);
  const [proposalNote, setProposalNote] = useState("");
  const [pickerMode, setPickerMode] =
    useState<"date" | "time" | null>(null);
  const [savingProposal, setSavingProposal] = useState(false);

  const [responseFor, setResponseFor] = useState<string | null>(null);
  const [prayerResponse, setPrayerResponse] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const [pastoralResponse, prayerResponseResult] = await Promise.all([
      supabase.rpc("list_pastoral_queue", {
        p_organization_id: activeOrganization.id,
      }),
      supabase.rpc("list_prayer_queue", {
        p_organization_id: activeOrganization.id,
      }),
    ]);

    if (pastoralResponse.error) {
      setErrorMessage(pastoralResponse.error.message);
    } else {
      setPastoral((pastoralResponse.data ?? []) as PastoralQueueItem[]);
    }

    if (prayerResponseResult.error) {
      setErrorMessage((current) => current ?? prayerResponseResult.error.message);
    } else {
      setPrayers((prayerResponseResult.data ?? []) as PrayerQueueItem[]);
    }

    setLoading(false);
  }, [activeOrganization]);

  useEffect(() => {
    void load();
  }, [load]);

  const pastoralOpenCount = useMemo(
    () =>
      pastoral.filter((item) =>
        ["REQUESTED", "RESCHEDULE_REQUESTED", "PROPOSED", "CONFIRMED"].includes(
          item.status
        )
      ).length,
    [pastoral]
  );

  const prayerOpenCount = useMemo(
    () =>
      prayers.filter((item) =>
        ["RECEIVED", "IN_PRAYER"].includes(item.status)
      ).length,
    [prayers]
  );

  function openProposal(item: PastoralQueueItem) {
    setProposalFor(item.request_id);
    setProposalNote(item.proposal_note ?? "");

    if (item.proposed_start_at) {
      setProposalDate(new Date(item.proposed_start_at));
    } else {
      setProposalDate(nextDefaultDate());
    }
  }

  function onPickerChange(
    event: DateTimePickerEvent,
    selected?: Date
  ) {
    if (Platform.OS === "android") {
      setPickerMode(null);
    }

    if (event.type === "dismissed" || !selected) {
      return;
    }

    setProposalDate((current) => {
      const next = new Date(current);

      if (pickerMode === "date") {
        next.setFullYear(
          selected.getFullYear(),
          selected.getMonth(),
          selected.getDate()
        );
      } else {
        next.setHours(
          selected.getHours(),
          selected.getMinutes(),
          0,
          0
        );
      }

      return next;
    });
  }

  async function submitProposal(requestId: string) {
    setSavingProposal(true);
    setErrorMessage(null);

    const end = new Date(proposalDate.getTime() + 60 * 60 * 1000);

    const { error } = await supabase.rpc(
      "propose_pastoral_appointment",
      {
        p_request_id: requestId,
        p_start_at: proposalDate.toISOString(),
        p_end_at: end.toISOString(),
        p_note: proposalNote.trim() || null,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      setProposalFor(null);
      setProposalNote("");
      await load();
    }

    setSavingProposal(false);
  }

  async function completePastoral(requestId: string) {
    setActionId(requestId);
    setErrorMessage(null);

    const { error } = await supabase.rpc(
      "complete_pastoral_appointment",
      {
        p_request_id: requestId,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      await load();
    }

    setActionId(null);
  }

  async function setPrayerStatus(
    requestId: string,
    status: "IN_PRAYER" | "ANSWERED" | "CLOSED",
    response?: string | null
  ) {
    setActionId(requestId);
    setErrorMessage(null);

    const { error } = await supabase.rpc(
      "set_prayer_request_status",
      {
        p_request_id: requestId,
        p_status: status,
        p_response_text: response?.trim() || null,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      setResponseFor(null);
      setPrayerResponse("");
      await load();
    }

    setActionId(null);
  }

  return (
    <EloScreen
      title="Cuidado pastoral"
      eyebrow="PASTORAL"
      subtitle="Fila de atendimentos e pedidos de oração que precisam de acompanhamento."
      onBack={onBack}
    >
      <View style={styles.tabs}>
        <TabButton
          active={tab === "pastoral"}
          label="Atendimentos"
          badge={pastoralOpenCount}
          onPress={() => setTab("pastoral")}
        />
        <TabButton
          active={tab === "prayer"}
          label="Orações"
          badge={prayerOpenCount}
          onPress={() => setTab("prayer")}
        />
      </View>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : tab === "pastoral" ? (
        pastoral.length === 0 ? (
          <EloState
            title="Nenhuma solicitação pastoral"
            description="Os pedidos enviados pelos membros aparecerão aqui."
            icon="ChatCenteredDotsIcon"
          />
        ) : (
          <View style={styles.list}>
            {pastoral.map((item) => (
              <EloCard key={item.request_id}>
                <View style={styles.cardTop}>
                  <View style={styles.personRow}>
                    <View style={styles.avatar}>
                      <P.UserIcon
                        size={19}
                        color={eloColors.blue}
                        weight="duotone"
                      />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.personName}>{item.person_name}</Text>
                      <Text style={styles.status}>
                        {pastoralStatus[item.status] ?? item.status}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.body}>{item.reason}</Text>

                {item.availability_notes ? (
                  <View style={styles.softBox}>
                    <Text style={styles.softLabel}>Disponibilidade do membro</Text>
                    <Text style={styles.softText}>{item.availability_notes}</Text>
                  </View>
                ) : null}

                {item.proposed_start_at ? (
                  <View style={styles.dateBox}>
                    <P.CalendarCheckIcon
                      size={20}
                      color={eloColors.blue}
                      weight="duotone"
                    />
                    <View style={styles.flex}>
                      <Text style={styles.softLabel}>Horário atual</Text>
                      <Text style={styles.dateValue}>
                        {formatDateTime(item.proposed_start_at)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {item.member_response_note ? (
                  <Text style={styles.memberNote}>
                    Retorno do membro: {item.member_response_note}
                  </Text>
                ) : null}

                {["REQUESTED", "RESCHEDULE_REQUESTED"].includes(item.status) ? (
                  proposalFor === item.request_id ? (
                    <View style={styles.editor}>
                      <Text style={styles.editorTitle}>Propor horário</Text>

                      <View style={styles.dateButtons}>
                        <Pressable
                          onPress={() => setPickerMode("date")}
                          style={styles.dateButton}
                        >
                          <P.CalendarIcon
                            size={17}
                            color={eloColors.blue}
                            weight="bold"
                          />
                          <Text style={styles.dateButtonText}>
                            {new Intl.DateTimeFormat("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            }).format(proposalDate)}
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => setPickerMode("time")}
                          style={styles.dateButton}
                        >
                          <P.ClockIcon
                            size={17}
                            color={eloColors.blue}
                            weight="bold"
                          />
                          <Text style={styles.dateButtonText}>
                            {new Intl.DateTimeFormat("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(proposalDate)}
                          </Text>
                        </Pressable>
                      </View>

                      {Platform.OS === "ios" ? (
                        <View style={styles.iosPickers}>
                          <DateTimePicker
                            value={proposalDate}
                            mode="date"
                            display="compact"
                            minimumDate={new Date()}
                            onChange={(event, selected) => {
                              setPickerMode("date");
                              onPickerChange(event, selected);
                            }}
                          />
                          <DateTimePicker
                            value={proposalDate}
                            mode="time"
                            display="compact"
                            onChange={(event, selected) => {
                              setPickerMode("time");
                              onPickerChange(event, selected);
                            }}
                          />
                        </View>
                      ) : null}

                      {Platform.OS === "android" && pickerMode ? (
                        <DateTimePicker
                          value={proposalDate}
                          mode={pickerMode}
                          minimumDate={pickerMode === "date" ? new Date() : undefined}
                          onChange={onPickerChange}
                        />
                      ) : null}

                      <TextInput
                        value={proposalNote}
                        onChangeText={setProposalNote}
                        placeholder="Observação para o membro (opcional)"
                        multiline
                        style={styles.input}
                      />

                      <View style={styles.actionRow}>
                        <View style={styles.flex}>
                          <EloActionButton
                            label="Enviar proposta"
                            loading={savingProposal}
                            onPress={() => void submitProposal(item.request_id)}
                            icon="PaperPlaneTiltIcon"
                          />
                        </View>
                        <View style={styles.flex}>
                          <EloActionButton
                            label="Cancelar"
                            variant="secondary"
                            disabled={savingProposal}
                            onPress={() => setProposalFor(null)}
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <EloActionButton
                      label="Propor horário"
                      onPress={() => openProposal(item)}
                      icon="CalendarPlusIcon"
                    />
                  )
                ) : null}

                {item.status === "CONFIRMED" ? (
                  <EloActionButton
                    label="Concluir atendimento"
                    loading={actionId === item.request_id}
                    onPress={() => void completePastoral(item.request_id)}
                    icon="CheckCircleIcon"
                  />
                ) : null}
              </EloCard>
            ))}
          </View>
        )
      ) : prayers.length === 0 ? (
        <EloState
          title="Nenhum pedido de oração"
          description="Os pedidos enviados pelos membros aparecerão aqui."
          icon="HandsPrayingIcon"
        />
      ) : (
        <View style={styles.list}>
          {prayers.map((item) => (
            <EloCard key={item.request_id}>
              <View style={styles.personRow}>
                <View style={styles.avatar}>
                  <P.HandsPrayingIcon
                    size={19}
                    color={eloColors.blue}
                    weight="duotone"
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.personName}>{item.person_name}</Text>
                  <Text style={styles.status}>
                    {prayerStatus[item.status] ?? item.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.body}>{item.message}</Text>

              {item.response_text ? (
                <View style={styles.softBox}>
                  <Text style={styles.softLabel}>Resposta enviada</Text>
                  <Text style={styles.softText}>{item.response_text}</Text>
                </View>
              ) : null}

              {item.status === "RECEIVED" ? (
                <EloActionButton
                  label="Marcar como em oração"
                  loading={actionId === item.request_id}
                  onPress={() =>
                    void setPrayerStatus(item.request_id, "IN_PRAYER")
                  }
                  icon="HandsPrayingIcon"
                />
              ) : null}

              {["RECEIVED", "IN_PRAYER"].includes(item.status) ? (
                responseFor === item.request_id ? (
                  <View style={styles.editor}>
                    <Text style={styles.editorTitle}>Responder ao membro</Text>
                    <TextInput
                      value={prayerResponse}
                      onChangeText={setPrayerResponse}
                      placeholder="Escreva uma mensagem de cuidado..."
                      multiline
                      textAlignVertical="top"
                      style={[styles.input, styles.responseInput]}
                    />
                    <View style={styles.actionRow}>
                      <View style={styles.flex}>
                        <EloActionButton
                          label="Enviar resposta"
                          loading={actionId === item.request_id}
                          disabled={prayerResponse.trim().length < 2}
                          onPress={() =>
                            void setPrayerStatus(
                              item.request_id,
                              "ANSWERED",
                              prayerResponse
                            )
                          }
                          icon="PaperPlaneTiltIcon"
                        />
                      </View>
                      <View style={styles.flex}>
                        <EloActionButton
                          label="Cancelar"
                          variant="secondary"
                          onPress={() => {
                            setResponseFor(null);
                            setPrayerResponse("");
                          }}
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  <EloActionButton
                    label="Responder"
                    variant="secondary"
                    onPress={() => setResponseFor(item.request_id)}
                    icon="ChatCenteredTextIcon"
                  />
                )
              ) : null}
            </EloCard>
          ))}
        </View>
      )}
    </EloScreen>
  );
}

function TabButton({
  active,
  label,
  badge,
  onPress,
}: {
  active: boolean;
  label: string;
  badge: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tab,
        active && styles.tabActive,
      ]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
      {badge > 0 ? (
        <View style={[styles.badge, active && styles.badgeActive]}>
          <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  tabs: {
    marginBottom: 14,
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  tabActive: {
    borderColor: eloColors.blue,
    backgroundColor: eloColors.surfaceSoft,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.muted,
  },
  tabTextActive: {
    color: eloColors.blue,
  },
  badge: {
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#EEF0F2",
  },
  badgeActive: {
    backgroundColor: "#DCEFFA",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: eloColors.muted,
  },
  badgeTextActive: {
    color: eloColors.blue,
  },
  loading: {
    paddingVertical: 70,
    alignItems: "center",
  },
  errorBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 13,
    backgroundColor: eloColors.dangerSoft,
  },
  errorText: {
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.danger,
  },
  list: {
    gap: 10,
  },
  cardTop: {
    marginBottom: 2,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: eloColors.surfaceSoft,
  },
  personName: {
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  status: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.blue,
  },
  body: {
    marginTop: 13,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 19,
    color: eloColors.ink,
  },
  softBox: {
    marginBottom: 12,
    padding: 11,
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  softLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
    color: eloColors.muted,
  },
  softText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.ink,
  },
  dateBox: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  dateValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  memberNote: {
    marginBottom: 12,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.muted,
  },
  editor: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: eloColors.line,
  },
  editorTitle: {
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  dateButtons: {
    flexDirection: "row",
    gap: 8,
  },
  dateButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  dateButtonText: {
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.ink,
  },
  iosPickers: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  input: {
    marginTop: 10,
    minHeight: 62,
    padding: 11,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    fontSize: 12,
    lineHeight: 17,
    color: eloColors.ink,
  },
  responseInput: {
    minHeight: 100,
  },
  actionRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
});
