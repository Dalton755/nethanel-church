import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
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

type EventSummary = {
  id: string;
  title: string;
  starts_at: string;
  location_name: string | null;
  cover_image_url: string | null;
};

type ScheduleSummary = {
  assignment_id: string;
  event_title: string;
  department_name: string;
  role_label: string;
  starts_at: string;
};

type NoticeSummary = {
  id: string;
  category: string;
  title: string;
  body: string;
  created_at: string;
};

function eventDateParts(value: string) {
  const date = new Date(value);
  const now = new Date();

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startTarget - startToday) / 86400000);

  const label =
    diffDays === 0
      ? "HOJE"
      : diffDays === 1
        ? "AMANHÃ"
        : new Intl.DateTimeFormat("pt-BR", {
            weekday: "long",
          })
            .format(date)
            .toUpperCase();

  return {
    label,
    date: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
    })
      .format(date)
      .replace(".", "")
      .toUpperCase(),
    time: new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MemberHomeScreen() {
  const {
    profile,
    activeOrganization,
    activeUnit,
    can,
    canAtOrganization,
  } = useOrganization();

  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const [nextEvent, setNextEvent] = useState<EventSummary | null>(null);
  const [schedule, setSchedule] = useState<ScheduleSummary | null>(null);
  const [notices, setNotices] = useState<NoticeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const canUseKids =
    can("kids.parent") ||
    canAtOrganization("kids.parent") ||
    can("kids.manage") ||
    canAtOrganization("kids.manage");

  const firstName =
    profile?.display_name?.trim().split(/\s+/)[0] || "";

  const greeting = useMemo(() => {
    const hour = new Date().getHours();

    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const now = new Date().toISOString();

      const [eventResponse, scheduleResponse, noticeResponse] =
        await Promise.all([
          supabase
            .from("events")
            .select("id,title,starts_at,location_name,cover_image_url")
            .eq("organization_id", activeOrganization.id)
            .eq("unit_id", activeUnit.id)
            .eq("status", "published")
            .gte("starts_at", now)
            .order("starts_at", { ascending: true })
            .limit(1)
            .maybeSingle(),

          supabase.rpc("list_my_schedule", {
            p_organization_id: activeOrganization.id,
          }),

          supabase
            .from("notifications")
            .select("id,category,title,body,created_at")
            .eq("organization_id", activeOrganization.id)
            .is("read_at", null)
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

      if (!eventResponse.error) {
        setNextEvent((eventResponse.data ?? null) as EventSummary | null);
      }

      if (!scheduleResponse.error) {
        const next =
          ((scheduleResponse.data ?? []) as ScheduleSummary[])
            .filter((item) => new Date(item.starts_at).getTime() >= Date.now())
            .sort(
              (a, b) =>
                new Date(a.starts_at).getTime() -
                new Date(b.starts_at).getTime()
            )[0] ?? null;

        setSchedule(next);
      }

      if (!noticeResponse.error) {
        setNotices((noticeResponse.data ?? []) as NoticeSummary[]);
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

  function openMemberModule(
    module:
      | "prayer"
      | "pastoral"
      | "contribution"
      | "events"
      | "kids"
      | "schedules"
  ) {
    navigation.navigate("Elo", {
      module,
      nonce: Date.now(),
    });
  }

  const eventParts = nextEvent ? eventDateParts(nextEvent.starts_at) : null;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.churchName}>
              {activeOrganization?.name ?? "Minha igreja"}
            </Text>
            <Text style={styles.greeting}>
              {greeting}{firstName ? `, ${firstName}` : ""}
            </Text>
          </View>

          <Pressable
            accessibilityLabel="Abrir notificações"
            onPress={() => navigation.navigate("Notificacoes")}
            style={styles.notificationButton}
          >
            <P.BellIcon size={22} color={eloColors.ink} weight="regular" />

            {notices.length > 0 ? <View style={styles.notificationDot} /> : null}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <Text style={styles.sectionEyebrow}>PRÓXIMO CULTO</Text>

            {nextEvent && eventParts ? (
              <Pressable
                onPress={() => navigation.navigate("Agenda")}
                style={({ pressed }) => [
                  styles.heroWrap,
                  pressed && styles.pressed,
                ]}
              >
                {nextEvent.cover_image_url ? (
                  <ImageBackground
                    source={{ uri: nextEvent.cover_image_url }}
                    resizeMode="cover"
                    style={styles.heroImage}
                    imageStyle={styles.heroImageRadius}
                  >
                    <View style={styles.heroOverlay}>
                      <HeroContent event={nextEvent} parts={eventParts} />
                    </View>
                  </ImageBackground>
                ) : (
                  <View style={styles.heroFallback}>
                    <HeroContent event={nextEvent} parts={eventParts} />
                  </View>
                )}
              </Pressable>
            ) : (
              <View style={styles.emptyHero}>
                <View style={styles.emptyHeroIcon}>
                  <P.ChurchIcon size={28} color={eloColors.blue} weight="duotone" />
                </View>
                <Text style={styles.emptyHeroTitle}>Nenhum culto publicado</Text>
                <Text style={styles.emptyHeroText}>
                  Assim que a igreja publicar o próximo culto, ele aparece aqui.
                </Text>
              </View>
            )}

            {schedule ? (
              <Pressable
                onPress={() => openMemberModule("schedules")}
                style={({ pressed }) => [
                  styles.pendingCard,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.pendingIcon}>
                  <P.ClipboardTextIcon
                    size={21}
                    color={eloColors.blue}
                    weight="duotone"
                  />
                </View>

                <View style={styles.pendingCopy}>
                  <Text style={styles.pendingKicker}>SUA PRÓXIMA ESCALA</Text>
                  <Text style={styles.pendingTitle}>{schedule.event_title}</Text>
                  <Text style={styles.pendingMeta}>
                    {schedule.department_name} • {schedule.role_label}
                  </Text>
                  <Text style={styles.pendingMeta}>
                    {formatDateTime(schedule.starts_at)}
                  </Text>
                </View>

                <P.CaretRightIcon size={18} color="#9AA4AE" weight="bold" />
              </Pressable>
            ) : null}

            {notices.length > 0 ? (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Avisos para você</Text>
                  <Pressable onPress={() => navigation.navigate("Notificacoes")}>
                    <Text style={styles.sectionLink}>Ver todos</Text>
                  </Pressable>
                </View>

                <View style={styles.noticeList}>
                  {notices.slice(0, 2).map((notice) => (
                    <Pressable
                      key={notice.id}
                      onPress={() => navigation.navigate("Notificacoes")}
                      style={({ pressed }) => [
                        styles.noticeCard,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.noticeIcon}>
                        <P.BellRingingIcon
                          size={20}
                          color={eloColors.blue}
                          weight="duotone"
                        />
                      </View>

                      <View style={styles.noticeCopy}>
                        <Text style={styles.noticeTitle}>{notice.title}</Text>
                        <Text numberOfLines={2} style={styles.noticeBody}>
                          {notice.body}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Como podemos ajudar?</Text>

            <View style={styles.actionsGrid}>
              <MemberAction
                icon="HandsPrayingIcon"
                label="Pedido de oração"
                helper="Compartilhe e acompanhe"
                onPress={() => openMemberModule("prayer")}
              />
              <MemberAction
                icon="ChatCenteredDotsIcon"
                label="Atendimento pastoral"
                helper="Solicite um horário"
                onPress={() => openMemberModule("pastoral")}
              />
              <MemberAction
                icon="HeartIcon"
                label="Contribuir"
                helper="Consulte o Pix da igreja"
                onPress={() => openMemberModule("contribution")}
              />
              <MemberAction
                icon="TicketIcon"
                label="Eventos"
                helper="Inscrições e próximos encontros"
                onPress={() => openMemberModule("events")}
              />
              {canUseKids ? (
                <MemberAction
                  icon="BabyIcon"
                  label="Elo Kids"
                  helper="Seus filhos e check-in"
                  onPress={() => openMemberModule("kids")}
                />
              ) : null}
              {schedule ? (
                <MemberAction
                  icon="ClipboardTextIcon"
                  label="Minha escala"
                  helper="Veja onde você vai servir"
                  onPress={() => openMemberModule("schedules")}
                />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroContent({
  event,
  parts,
}: {
  event: EventSummary;
  parts: ReturnType<typeof eventDateParts>;
}) {
  return (
    <View style={styles.heroContent}>
      <View style={styles.heroTopRow}>
        <View style={styles.datePill}>
          <Text style={styles.datePillLabel}>{parts.label}</Text>
          <Text style={styles.datePillDate}>{parts.date}</Text>
        </View>

        <View style={styles.timePill}>
          <P.ClockIcon size={16} color="#FFFFFF" weight="bold" />
          <Text style={styles.timePillText}>{parts.time}</Text>
        </View>
      </View>

      <View>
        <Text style={styles.heroTitle}>{event.title}</Text>
        <Text style={styles.heroMeta}>
          {event.location_name ?? "Na sua igreja"}
        </Text>
      </View>
    </View>
  );
}

function MemberAction({
  icon,
  label,
  helper,
  onPress,
}: {
  icon: string;
  label: string;
  helper: string;
  onPress: () => void;
}) {
  const Icon = P[icon] ?? P.SquaresFourIcon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.actionIcon}>
        <Icon size={22} color={eloColors.blue} weight="duotone" />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionHelper}>{helper}</Text>
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
    paddingTop: 14,
    paddingBottom: 36,
  },
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  churchName: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: eloColors.muted,
  },
  greeting: {
    marginTop: 5,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    color: eloColors.ink,
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
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: eloColors.danger,
  },
  loading: {
    paddingVertical: 90,
    alignItems: "center",
  },
  sectionEyebrow: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    color: eloColors.muted,
  },
  heroWrap: {
    height: 236,
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#1A1F24",
  },
  heroImage: {
    flex: 1,
  },
  heroImageRadius: {
    borderRadius: 24,
  },
  heroOverlay: {
    flex: 1,
    padding: 18,
    backgroundColor: "rgba(12,17,22,0.52)",
  },
  heroFallback: {
    flex: 1,
    padding: 18,
    borderWidth: 1,
    borderColor: "#CFE3F1",
    borderRadius: 24,
    backgroundColor: "#1D6E9C",
  },
  heroContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  datePill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  datePillLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: "#33414C",
  },
  datePillDate: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "900",
    color: "#111111",
  },
  timePill: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  timePillText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroTitle: {
    maxWidth: "90%",
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroMeta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
  },
  emptyHero: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
  },
  emptyHeroIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: eloColors.surfaceSoft,
  },
  emptyHeroTitle: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: "900",
    color: eloColors.ink,
  },
  emptyHeroText: {
    marginTop: 6,
    maxWidth: 280,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: eloColors.muted,
  },
  pendingCard: {
    marginTop: 12,
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  pendingIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: eloColors.surfaceSoft,
  },
  pendingCopy: {
    flex: 1,
  },
  pendingKicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
    color: eloColors.blue,
  },
  pendingTitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  pendingMeta: {
    marginTop: 3,
    fontSize: 11,
    color: eloColors.muted,
  },
  sectionRow: {
    marginTop: 28,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  sectionLink: {
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.blue,
  },
  noticeList: {
    gap: 8,
  },
  noticeCard: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
  },
  noticeIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  noticeBody: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.muted,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionCard: {
    width: "48%",
    minHeight: 124,
    padding: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
  },
  actionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: eloColors.surfaceSoft,
  },
  actionLabel: {
    marginTop: 11,
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  actionHelper: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    color: eloColors.muted,
  },
  pressed: {
    opacity: 0.76,
  },
});
