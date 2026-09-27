import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as Phosphor from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import type { MainTabParamList } from "../../navigation/MainTabs";
import { eloColors } from "../elo/EloUi";

const P = Phosphor as any;

type PastoralItem = {
  request_id: string;
  reason: string;
  status: string;
  proposed_start_at: string | null;
  proposed_end_at: string | null;
};

type ScheduleItem = {
  assignment_id: string;
  event_title: string;
  department_name: string;
  role_label: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
};

type RegistrationItem = {
  registration_id: string;
  event_id: string;
  event_title: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  status: string;
};

type PreacherInvitation = {
  invitation_id: string;
  event_id: string;
  event_title: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  theme: string | null;
  status: "pending" | "accepted";
};

type AgendaItem = {
  id: string;
  type: "pastoral" | "schedule" | "event";
  title: string;
  subtitle: string;
  startsAt: string;
  location?: string | null;
  action?: "pastoral" | "schedules" | "events";
  status?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateKey(value: string) {
  const date = new Date(value);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function MemberAgendaScreen() {
  const { activeOrganization } = useOrganization();
  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const [pastoral, setPastoral] = useState<PastoralItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [preacherInvitations, setPreacherInvitations] =
    useState<PreacherInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [
      pastoralResponse,
      scheduleResponse,
      registrationResponse,
      preacherResponse,
    ] = await Promise.all([
        supabase.rpc("list_my_pastoral_requests", {
          p_organization_id: activeOrganization.id,
        }),
        supabase.rpc("list_my_schedule", {
          p_organization_id: activeOrganization.id,
        }),
        supabase.rpc("list_my_event_registrations", {
          p_organization_id: activeOrganization.id,
        }),
        supabase.rpc("list_my_preacher_invitations", {
          p_organization_id: activeOrganization.id,
        }),
      ]);

    if (!pastoralResponse.error) {
      setPastoral((pastoralResponse.data ?? []) as PastoralItem[]);
    }

    if (!scheduleResponse.error) {
      setSchedules((scheduleResponse.data ?? []) as ScheduleItem[]);
    }

    if (!registrationResponse.error) {
      setRegistrations((registrationResponse.data ?? []) as RegistrationItem[]);
    }

    if (!preacherResponse.error) {
      setPreacherInvitations(
        (preacherResponse.data ?? []) as PreacherInvitation[]
      );
    }

    setLoading(false);
  }, [activeOrganization]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const agenda = useMemo(() => {
    const now = Date.now();
    const result: AgendaItem[] = [];

    for (const item of pastoral) {
      if (
        item.proposed_start_at &&
        ["PROPOSED", "CONFIRMED"].includes(item.status) &&
        new Date(item.proposed_start_at).getTime() >= now
      ) {
        result.push({
          id: `pastoral:${item.request_id}`,
          type: "pastoral",
          title: "Atendimento pastoral",
          subtitle:
            item.status === "PROPOSED"
              ? "Aguardando sua confirmação"
              : "Horário confirmado",
          startsAt: item.proposed_start_at,
          action: "pastoral",
          status: item.status,
        });
      }
    }

    for (const item of schedules) {
      if (
        new Date(item.starts_at).getTime() >= now &&
        ["pending", "confirmed", "replacement_requested"].includes(
          item.status
        )
      ) {
        result.push({
          id: `schedule:${item.assignment_id}`,
          type: "schedule",
          title: item.event_title,
          subtitle: `${item.department_name} • ${item.role_label}`,
          startsAt: item.starts_at,
          location: item.location_name,
          action: "schedules",
          status: item.status,
        });
      }
    }

    for (const item of preacherInvitations) {
      if (new Date(item.starts_at).getTime() >= now) {
        result.push({
          id: `preacher:${item.invitation_id}`,
          type: "schedule",
          title: item.event_title,
          subtitle:
            item.status === "accepted"
              ? `Pregador confirmado${item.theme ? ` • ${item.theme}` : ""}`
              : `Convite para pregar aguardando resposta${item.theme ? ` • ${item.theme}` : ""}`,
          startsAt: item.starts_at,
          location: item.location_name,
          action: "schedules",
          status: item.status,
        });
      }
    }

    for (const item of registrations) {
      if (new Date(item.starts_at).getTime() >= now) {
        result.push({
          id: `event:${item.registration_id}`,
          type: "event",
          title: item.event_title,
          subtitle:
            item.status === "WAITLIST"
              ? "Lista de espera"
              : "Inscrição confirmada",
          startsAt: item.starts_at,
          location: item.location_name,
          action: "events",
          status: item.status,
        });
      }
    }

    return result.sort(
      (a, b) =>
        new Date(a.startsAt).getTime() -
        new Date(b.startsAt).getTime()
    );
  }, [pastoral, schedules, registrations, preacherInvitations]);

  const grouped = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();

    for (const item of agenda) {
      const key = dateKey(item.startsAt);
      const current = map.get(key) ?? [];
      current.push(item);
      map.set(key, current);
    }

    return Array.from(map.entries());
  }, [agenda]);

  function open(item: AgendaItem) {
    if (!item.action) return;

    navigation.navigate("Elo", {
      module: item.action,
      nonce: Date.now(),
    });
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>MINHA AGENDA</Text>
        <Text style={styles.title}>Seus próximos compromissos</Text>
        <Text style={styles.subtitle}>
          Atendimentos, eventos, escalas e convites para pregar aparecem aqui organizados por data.
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : grouped.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <P.CalendarCheckIcon
                size={27}
                color={eloColors.blue}
                weight="duotone"
              />
            </View>
            <Text style={styles.emptyTitle}>Sua agenda está livre</Text>
            <Text style={styles.emptyText}>
              Quando você tiver um atendimento, inscrição ou escala, o compromisso aparecerá aqui.
            </Text>
          </View>
        ) : (
          <View style={styles.groups}>
            {grouped.map(([key, items]) => (
              <View key={key}>
                <Text style={styles.dateHeader}>
                  {formatDate(items[0].startsAt)}
                </Text>

                <View style={styles.dayList}>
                  {items.map((item) => {
                    const Icon =
                      item.type === "pastoral"
                        ? P.ChatCenteredDotsIcon
                        : item.type === "schedule"
                          ? P.ClipboardTextIcon
                          : P.TicketIcon;

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => open(item)}
                        style={({ pressed }) => [
                          styles.itemCard,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.timeColumn}>
                          <Text style={styles.time}>
                            {formatTime(item.startsAt)}
                          </Text>
                        </View>

                        <View style={styles.itemIcon}>
                          <Icon
                            size={20}
                            color={eloColors.blue}
                            weight="duotone"
                          />
                        </View>

                        <View style={styles.itemCopy}>
                          <Text style={styles.itemTitle}>{item.title}</Text>
                          <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                          {item.location ? (
                            <Text style={styles.itemLocation}>
                              {item.location}
                            </Text>
                          ) : null}
                        </View>

                        <P.CaretRightIcon
                          size={17}
                          color="#9AA4AE"
                          weight="bold"
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: eloColors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: eloColors.blue,
  },
  title: {
    marginTop: 7,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    color: eloColors.ink,
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 520,
    fontSize: 13,
    lineHeight: 20,
    color: eloColors.muted,
  },
  loading: {
    paddingVertical: 80,
    alignItems: "center",
  },
  empty: {
    marginTop: 28,
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
  },
  emptyIcon: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: eloColors.surfaceSoft,
  },
  emptyTitle: {
    marginTop: 15,
    fontSize: 17,
    fontWeight: "900",
    color: eloColors.ink,
  },
  emptyText: {
    marginTop: 7,
    maxWidth: 290,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: eloColors.muted,
  },
  groups: {
    marginTop: 26,
    gap: 24,
  },
  dateHeader: {
    marginBottom: 9,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "capitalize",
    color: eloColors.muted,
  },
  dayList: {
    gap: 8,
  },
  itemCard: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
  },
  timeColumn: {
    width: 48,
  },
  time: {
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  itemIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: eloColors.surfaceSoft,
  },
  itemCopy: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  itemSubtitle: {
    marginTop: 3,
    fontSize: 11,
    color: eloColors.muted,
  },
  itemLocation: {
    marginTop: 3,
    fontSize: 10,
    color: eloColors.muted,
  },
  pressed: {
    opacity: 0.76,
  },
});
