import { useCallback, useState } from "react";
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

import { EloLogo } from "../../branding/EloBrand";
import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import type { MainTabParamList } from "../../navigation/MainTabs";
import { useUnreadNotifications } from "../notifications/useUnreadNotifications";
import { eloColors } from "../elo/EloUi";

const P = Phosphor as any;

type ScheduleSummary = {
  assignment_id: string;
  event_title: string;
  department_name: string;
  role_label: string;
  status: string;
  starts_at: string;
};

type EventSummary = {
  id: string;
  title: string;
  starts_at: string;
  location_name: string | null;
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

export function HomeScreen() {
  const {
    profile,
    activeOrganization,
    activeUnit,
  } = useOrganization();

  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const { unreadCount } = useUnreadNotifications(activeOrganization?.id);

  const [schedule, setSchedule] = useState<ScheduleSummary | null>(null);
  const [nextEvent, setNextEvent] = useState<EventSummary | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const firstName =
    profile?.display_name?.trim().split(/\s+/)[0] || "";

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const now = new Date();
      const dayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0, 0, 0, 0
      );
      const dayEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0, 0, 0, 0
      );

      const [scheduleResponse, eventResponse, todayResponse] = await Promise.all([
        supabase.rpc("list_my_schedule", {
          p_organization_id: activeOrganization.id,
        }),

        supabase
          .from("events")
          .select("id,title,starts_at,location_name")
          .eq("organization_id", activeOrganization.id)
          .eq("unit_id", activeUnit.id)
          .eq("status", "published")
          .gte("starts_at", now.toISOString())
          .order("starts_at", { ascending: true })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrganization.id)
          .eq("unit_id", activeUnit.id)
          .neq("status", "cancelled")
          .gte("starts_at", dayStart.toISOString())
          .lt("starts_at", dayEnd.toISOString()),
      ]);

      if (!scheduleResponse.error) {
        const nextSchedule = (
          (scheduleResponse.data ?? []) as ScheduleSummary[]
        )
          .filter(
            (item) =>
              new Date(item.starts_at).getTime() >= now.getTime()
          )
          .sort(
            (a, b) =>
              new Date(a.starts_at).getTime() -
              new Date(b.starts_at).getTime()
          )[0] ?? null;

        setSchedule(nextSchedule);
      }

      if (!eventResponse.error) {
        setNextEvent((eventResponse.data ?? null) as EventSummary | null);
      }

      if (!todayResponse.error) {
        setTodayCount(todayResponse.count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function openModule(module: "schedules" | "events" | "kids" | "departments") {
    navigation.navigate("Elo", {
      module,
      nonce: Date.now(),
    });
  }

  const greeting =
    new Date().getHours() < 12
      ? "Bom dia"
      : new Date().getHours() < 18
        ? "Boa tarde"
        : "Boa noite";

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <EloLogo compact />

          <Pressable
            accessibilityLabel="Abrir notificações"
            onPress={() => navigation.navigate("Notificacoes")}
            style={styles.notificationButton}
          >
            <P.BellIcon size={21} color={eloColors.ink} weight="regular" />

            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.context}>
          <View style={styles.contextDot} />
          <Text style={styles.contextText}>
            {activeOrganization?.name}
            {activeUnit?.name && activeUnit.name !== activeOrganization?.name
              ? ` • ${activeUnit.name}`
              : ""}
          </Text>
        </View>

        <Text style={styles.greeting}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </Text>

        <Text style={styles.helper}>
          Aqui está o que merece sua atenção agora.
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <View style={styles.heroGrid}>
              <Pressable
                onPress={() => openModule("schedules")}
                style={({ pressed }) => [
                  styles.heroCard,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.heroIconBlue}>
                  <P.ClipboardTextIcon
                    size={22}
                    color={eloColors.blue}
                    weight="duotone"
                  />
                </View>

                <Text style={styles.heroLabel}>Minha próxima escala</Text>

                {schedule ? (
                  <>
                    <Text style={styles.heroValue} numberOfLines={2}>
                      {schedule.event_title}
                    </Text>
                    <Text style={styles.heroMeta}>
                      {schedule.department_name} • {schedule.role_label}
                    </Text>
                    <Text style={styles.heroMeta}>
                      {formatDateTime(schedule.starts_at)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.heroEmpty}>
                    Nada pendente para servir.
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate("Agenda")}
                style={({ pressed }) => [
                  styles.heroCard,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.heroIconGreen}>
                  <P.CalendarDotsIcon
                    size={22}
                    color={eloColors.green}
                    weight="duotone"
                  />
                </View>

                <Text style={styles.heroLabel}>Hoje</Text>
                <Text style={styles.bigNumber}>{todayCount}</Text>
                <Text style={styles.heroMeta}>
                  compromisso{todayCount === 1 ? "" : "s"} na agenda
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Próximo na igreja</Text>

            <Pressable
              onPress={() => openModule("events")}
              style={({ pressed }) => [
                styles.nextCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.nextIcon}>
                <P.ChurchIcon
                  size={23}
                  color={eloColors.yellow}
                  weight="duotone"
                />
              </View>

              <View style={styles.nextCopy}>
                <Text style={styles.nextTitle}>
                  {nextEvent?.title ?? "Nenhum culto ou evento agendado"}
                </Text>

                <Text style={styles.nextMeta}>
                  {nextEvent
                    ? `${formatDateTime(nextEvent.starts_at)}${nextEvent.location_name ? ` • ${nextEvent.location_name}` : ""}`
                    : "Quando a liderança publicar, aparece aqui."}
                </Text>
              </View>

              <P.CaretRightIcon
                size={18}
                color="#9AA4AE"
                weight="bold"
              />
            </Pressable>

            <Text style={styles.sectionTitle}>Ações rápidas</Text>

            <View style={styles.quickGrid}>
              <QuickAction
                icon="ClipboardTextIcon"
                label="Escalas"
                onPress={() => openModule("schedules")}
              />
              <QuickAction
                icon="TicketIcon"
                label="Eventos"
                onPress={() => openModule("events")}
              />
              <QuickAction
                icon="BabyIcon"
                label="Elo Kids"
                onPress={() => openModule("kids")}
              />
              <QuickAction
                icon="UsersThreeIcon"
                label="Departamentos"
                onPress={() => openModule("departments")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const Icon = P[icon] ?? P.SquaresFourIcon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.quickIcon}>
        <Icon size={21} color={eloColors.blue} weight="duotone" />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
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
    paddingTop: 10,
    paddingBottom: 36,
  },
  topBar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notificationButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: eloColors.danger,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  context: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  contextDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: eloColors.green,
  },
  contextText: {
    fontSize: 12,
    fontWeight: "700",
    color: eloColors.muted,
  },
  greeting: {
    marginTop: 18,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
    color: eloColors.ink,
  },
  helper: {
    marginTop: 6,
    fontSize: 14,
    color: eloColors.muted,
  },
  loading: {
    paddingVertical: 70,
    alignItems: "center",
  },
  heroGrid: {
    marginTop: 24,
    flexDirection: "row",
    gap: 10,
  },
  heroCard: {
    flex: 1,
    minHeight: 176,
    padding: 15,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
  },
  heroIconBlue: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  heroIconGreen: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.successSoft,
  },
  heroLabel: {
    marginTop: 14,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  heroValue: {
    marginTop: 5,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    color: eloColors.ink,
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    color: eloColors.muted,
  },
  heroEmpty: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: eloColors.muted,
  },
  bigNumber: {
    marginTop: 4,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: "900",
    color: eloColors.ink,
  },
  sectionTitle: {
    marginTop: 26,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: eloColors.muted,
  },
  nextCard: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  nextIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#FFF7E5",
  },
  nextCopy: {
    flex: 1,
  },
  nextTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  nextMeta: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.muted,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickAction: {
    width: "48%",
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
  },
  quickIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: eloColors.surfaceSoft,
  },
  quickLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.ink,
  },
  pressed: {
    opacity: 0.76,
  },
});
