import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
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
} from "../elo/EloUi";
import {
  NewServiceScreen,
  type ServiceEditorData,
} from "./NewServiceScreen";
import { ServiceDetailsScreen } from "./ServiceDetailsScreen";
import { ServiceOccurrenceEditorScreen } from "./ServiceOccurrenceEditorScreen";
import {
  ServiceSeriesScreen,
  type SeriesRoutine,
} from "./ServiceSeriesScreen";

const P = Phosphor as any;

type AgendaEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  status: string;
  visibility: string;
  cover_image_path: string | null;
  cover_image_url: string | null;
  recurring: boolean;
  routine_id: string | null;
  original_date: string | null;
};

type Routine = {
  id: string;
  name: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  start_date: string;
  location_name: string | null;
  active: boolean;
};

type Occurrence = {
  event_id: string;
  routine_id: string;
  original_date: string;
};

type ServiceSeries = {
  id: string;
  routine_id: string;
  name: string;
  mode: "DAYS" | "OCCURRENCES" | "UNTIL_DATE";
  start_date: string;
  total_days: number | null;
  total_occurrences: number | null;
  until_date: string | null;
  status: "scheduled" | "active" | "completed" | "cancelled";
};

const WEEKDAYS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

function formatEventDate(value: string) {
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

function routineTime(value: string) {
  return value.slice(0, 5);
}

function dateOnlyParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function dayDiff(from: string, to: Date) {
  const start = dateOnlyParts(from);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(
    to.getFullYear(),
    to.getMonth(),
    to.getDate()
  );
  return Math.floor((endUtc - startUtc) / 86400000);
}

function addDateOnlyDays(value: string, days: number) {
  const parts = dateOnlyParts(value);
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days)
  );
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateOnly(value: string) {
  const parts = dateOnlyParts(value);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

function seriesStatus(series: ServiceSeries) {
  if (series.mode !== "DAYS" || !series.total_days) {
    if (series.status === "scheduled") {
      return `Começa em ${formatDateOnly(series.start_date)}`;
    }

    return series.status === "active" ? "Em andamento" : "Programada";
  }

  const diff = dayDiff(series.start_date, new Date());

  if (diff < 0 || series.status === "scheduled") {
    return `Começa em ${formatDateOnly(series.start_date)}`;
  }

  const current = Math.min(
    series.total_days,
    Math.max(1, diff + 1)
  );

  return `Dia ${current}/${series.total_days}`;
}

export function AgendaScreen() {
  const {
    activeOrganization,
    activeUnit,
    permissions,
  } = useOrganization();

  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [series, setSeries] = useState<ServiceSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingService, setCreatingService] = useState(false);
  const [editingService, setEditingService] =
    useState<ServiceEditorData | null>(null);
  const [viewingService, setViewingService] =
    useState<ServiceEditorData | null>(null);
  const [editingOccurrence, setEditingOccurrence] =
    useState<ServiceEditorData | null>(null);
  const [seriesRoutine, setSeriesRoutine] =
    useState<SeriesRoutine | null>(null);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const canManage =
    permissions.includes("agenda.manage") &&
    permissions.includes("services.manage");

  const activeRoutineCount = useMemo(
    () => routines.filter((routine) => routine.active).length,
    [routines]
  );

  const seriesByRoutine = useMemo(() => {
    const map = new Map<string, ServiceSeries>();

    for (const item of series) {
      const existing = map.get(item.routine_id);

      if (!existing) {
        map.set(item.routine_id, item);
        continue;
      }

      if (
        item.status === "active" &&
        existing.status !== "active"
      ) {
        map.set(item.routine_id, item);
      }
    }

    return map;
  }, [series]);

  const loadAgenda = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setEvents([]);
      setRoutines([]);
      setSeries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data: serviceType, error: typeError } =
        await supabase
          .from("event_types")
          .select("id")
          .eq("organization_id", activeOrganization.id)
          .eq("type_key", "service")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

      if (typeError) throw typeError;

      if (!serviceType?.id) {
        throw new Error(
          "O tipo Culto ainda não foi configurado nesta igreja."
        );
      }

      const [
        eventsResponse,
        routinesResponse,
        seriesResponse,
      ] = await Promise.all([
        supabase
          .from("events")
          .select(
            "id,title,description,starts_at,ends_at,location_name,status,visibility,cover_image_path"
          )
          .eq("organization_id", activeOrganization.id)
          .eq("unit_id", activeUnit.id)
          .eq("event_type_id", serviceType.id)
          .neq("status", "cancelled")
          .gte(
            "starts_at",
            new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
          )
          .order("starts_at", { ascending: true })
          .limit(60),

        supabase
          .from("service_routines")
          .select(
            "id,name,weekday,start_time,duration_minutes,start_date,location_name,active"
          )
          .eq("organization_id", activeOrganization.id)
          .eq("unit_id", activeUnit.id)
          .eq("active", true)
          .order("weekday", { ascending: true })
          .order("start_time", { ascending: true }),

        supabase
          .from("service_series")
          .select(
            "id,routine_id,name,mode,start_date,total_days,total_occurrences,until_date,status"
          )
          .eq("organization_id", activeOrganization.id)
          .in("status", ["active", "scheduled"])
          .order("start_date", { ascending: true }),
      ]);

      if (eventsResponse.error) throw eventsResponse.error;
      if (routinesResponse.error) throw routinesResponse.error;

      const rawEvents = (eventsResponse.data ?? []) as Omit<
        AgendaEvent,
        "cover_image_url" | "recurring" | "routine_id" | "original_date"
      >[];

      let occurrences: Occurrence[] = [];

      if (rawEvents.length > 0) {
        const { data, error } = await supabase
          .from("service_occurrences")
          .select("event_id,routine_id,original_date")
          .in(
            "event_id",
            rawEvents.map((event) => event.id)
          );

        if (!error) {
          occurrences = (data ?? []) as Occurrence[];
        }
      }

      const occurrenceByEvent = new Map(
        occurrences.map((item) => [item.event_id, item])
      );

      const withImages = await Promise.all(
        rawEvents.map(async (event) => {
          let signedUrl: string | null = null;

          if (event.cover_image_path) {
            const { data } = await supabase.storage
              .from("event-covers")
              .createSignedUrl(event.cover_image_path, 60 * 60);

            signedUrl = data?.signedUrl ?? null;
          }

          const occurrence = occurrenceByEvent.get(event.id);

          return {
            ...event,
            cover_image_url: signedUrl,
            recurring: Boolean(occurrence),
            routine_id: occurrence?.routine_id ?? null,
            original_date: occurrence?.original_date ?? null,
          } satisfies AgendaEvent;
        })
      );

      setEvents(withImages);
      setRoutines((routinesResponse.data ?? []) as Routine[]);
      setSeries(
        seriesResponse.error
          ? []
          : ((seriesResponse.data ?? []) as ServiceSeries[])
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os cultos."
      );
      setEvents([]);
      setRoutines([]);
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit]);

  useFocusEffect(
    useCallback(() => {
      void loadAgenda();
    }, [loadAgenda])
  );

  async function openService(event: AgendaEvent) {
    if (!activeOrganization) return;

    const { data, error } = await supabase
      .from("services")
      .select(
        "theme,preacher_name,bible_reference,livestream_url,notes"
      )
      .eq("event_id", event.id)
      .eq("organization_id", activeOrganization.id)
      .maybeSingle();

    if (error) {
      Alert.alert("Culto", error.message);
      return;
    }

    setViewingService({
      id: event.id,
      title: event.title,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      location_name: event.location_name,
      visibility: event.visibility,
      cover_image_path: event.cover_image_path,
      cover_image_url: event.cover_image_url,
      theme: data?.theme ?? null,
      preacher_name: data?.preacher_name ?? null,
      bible_reference: data?.bible_reference ?? null,
      livestream_url: data?.livestream_url ?? null,
      notes: data?.notes ?? null,
      recurring: event.recurring,
      routine_id: event.routine_id,
      original_date: event.original_date,
    });
  }

  async function deleteCurrentService() {
    if (!activeOrganization || !viewingService) return;

    try {
      if (
        viewingService.recurring &&
        viewingService.routine_id &&
        viewingService.original_date
      ) {
        const { error } = await supabase.rpc(
          "set_service_exception",
          {
            p_organization_id: activeOrganization.id,
            p_routine_id: viewingService.routine_id,
            p_original_date: viewingService.original_date,
            p_action: "cancel",
            p_new_date: null,
            p_new_time: null,
            p_reason: "Cancelado pelo Nethanel Elo",
          }
        );

        if (error) throw error;
      } else {
        const { error } = await supabase.rpc(
          "delete_service_event",
          {
            p_event_id: viewingService.id,
            p_organization_id: activeOrganization.id,
          }
        );

        if (error) throw error;
      }

      setViewingService(null);
      await loadAgenda();
    } catch (error) {
      Alert.alert(
        "Não foi possível cancelar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    }
  }

  if (creatingService || editingService) {
    return (
      <NewServiceScreen
        service={editingService}
        onCancel={() => {
          setCreatingService(false);
          setEditingService(null);
        }}
        onSaved={async () => {
          setCreatingService(false);
          setEditingService(null);
          await loadAgenda();
        }}
      />
    );
  }

  if (seriesRoutine) {
    return (
      <ServiceSeriesScreen
        routine={seriesRoutine}
        onBack={() => setSeriesRoutine(null)}
        onSaved={async () => {
          setSeriesRoutine(null);
          await loadAgenda();
        }}
      />
    );
  }

  if (editingOccurrence) {
    return (
      <ServiceOccurrenceEditorScreen
        service={editingOccurrence}
        onBack={() => setEditingOccurrence(null)}
        onSaved={async () => {
          setEditingOccurrence(null);
          await loadAgenda();
        }}
      />
    );
  }

  if (viewingService) {
    return (
      <ServiceDetailsScreen
        service={viewingService}
        canManage={canManage}
        onBack={() => setViewingService(null)}
        onEdit={() => {
          setEditingService(viewingService);
          setViewingService(null);
        }}
        onEditDetails={() => {
          setEditingOccurrence(viewingService);
          setViewingService(null);
        }}
        onDelete={() => {
          Alert.alert(
            viewingService.recurring
              ? "Cancelar esta ocorrência?"
              : "Excluir culto?",
            viewingService.recurring
              ? "A rotina continuará ativa e somente este culto será cancelado."
              : "Esta ação remove este culto da agenda.",
            [
              { text: "Voltar", style: "cancel" },
              {
                text: viewingService.recurring
                  ? "Cancelar ocorrência"
                  : "Excluir",
                style: "destructive",
                onPress: () => void deleteCurrentService(),
              },
            ]
          );
        }}
      />
    );
  }

  return (
    <EloScreen
      title="Agenda"
      eyebrow="ELO • CULTOS"
      subtitle="Cultos únicos, rotinas semanais e séries organizados no mesmo fluxo."
      right={
        canManage ? (
          <Pressable
            onPress={() => setCreatingService(true)}
            style={styles.addButton}
          >
            <P.PlusIcon
              size={20}
              color="#FFFFFF"
              weight="bold"
            />
          </Pressable>
        ) : undefined
      }
    >
      {canManage ? (
        <View style={styles.primaryAction}>
          <EloActionButton
            label="Novo culto"
            icon="PlusIcon"
            onPress={() => setCreatingService(true)}
          />
        </View>
      ) : null}

      {activeRoutineCount > 0 ? (
        <>
          <Text style={eloSharedStyles.sectionTitle}>
            Rotinas recorrentes
          </Text>

          <View style={styles.routineList}>
            {routines.map((routine) => {
              const activeSeries = seriesByRoutine.get(routine.id);

              return (
                <EloCard key={routine.id}>
                  <View style={styles.routineHeader}>
                    <View style={styles.routineIcon}>
                      <P.ArrowsClockwiseIcon
                        size={21}
                        color={eloColors.blue}
                        weight="duotone"
                      />
                    </View>

                    <View style={styles.routineCopy}>
                      <Text style={eloSharedStyles.cardTitle}>
                        {routine.name}
                      </Text>

                      <Text style={styles.routineMeta}>
                        {"Toda " +
                          WEEKDAYS[routine.weekday] +
                          " • " +
                          routineTime(routine.start_time) +
                          " • " +
                          routine.duration_minutes +
                          " min"}
                      </Text>

                      {routine.location_name ? (
                        <Text style={styles.routineLocation}>
                          {routine.location_name}
                        </Text>
                      ) : null}
                    </View>

                    <Text style={styles.activeBadge}>Ativa</Text>
                  </View>

                  {activeSeries ? (
                    <View style={styles.seriesBox}>
                      <View style={styles.seriesTop}>
                        <View style={styles.seriesIcon}>
                          <P.BookOpenTextIcon
                            size={18}
                            color={eloColors.blue}
                            weight="duotone"
                          />
                        </View>
                        <View style={styles.seriesCopy}>
                          <Text style={styles.seriesName}>
                            {activeSeries.name}
                          </Text>
                          <Text style={styles.seriesProgress}>
                            {seriesStatus(activeSeries)}
                          </Text>
                        </View>
                      </View>

                      {activeSeries.mode === "DAYS" &&
                      activeSeries.total_days ? (
                        <Text style={styles.seriesEnd}>
                          Término:{" "}
                          {addDateOnlyDays(
                            activeSeries.start_date,
                            activeSeries.total_days - 1
                          )}
                        </Text>
                      ) : null}
                    </View>
                  ) : canManage ? (
                    <Pressable
                      onPress={() =>
                        setSeriesRoutine({
                          id: routine.id,
                          name: routine.name,
                        })
                      }
                      style={styles.addSeries}
                    >
                      <P.PlusCircleIcon
                        size={17}
                        color={eloColors.blue}
                        weight="duotone"
                      />
                      <Text style={styles.addSeriesText}>
                        Adicionar série
                      </Text>
                    </Pressable>
                  ) : null}
                </EloCard>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>
        Próximos cultos
      </Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : errorMessage ? (
        <EloState
          title="Não conseguimos carregar a agenda"
          description={errorMessage}
          icon="WarningCircleIcon"
        />
      ) : events.length === 0 ? (
        <EloState
          title="Nenhum culto agendado"
          description={
            canManage
              ? "Crie um culto único ou uma rotina semanal para começar."
              : "Quando a liderança publicar os próximos cultos, eles aparecerão aqui."
          }
          icon="CalendarDotsIcon"
        />
      ) : (
        <View style={styles.eventList}>
          {events.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => void openService(event)}
              style={({ pressed }) => [
                styles.eventCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "2-digit",
                  }).format(new Date(event.starts_at))}
                </Text>
                <Text style={styles.dateMonth}>
                  {new Intl.DateTimeFormat("pt-BR", {
                    month: "short",
                  })
                    .format(new Date(event.starts_at))
                    .replace(".", "")
                    .toUpperCase()}
                </Text>
              </View>

              <View style={styles.eventCopy}>
                <View style={styles.eventTitleRow}>
                  <Text
                    numberOfLines={1}
                    style={styles.eventTitle}
                  >
                    {event.title}
                  </Text>

                  {event.recurring ? (
                    <View style={styles.recurringBadge}>
                      <P.ArrowsClockwiseIcon
                        size={11}
                        color={eloColors.blue}
                        weight="bold"
                      />
                      <Text style={styles.recurringBadgeText}>
                        Recorrente
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.eventMeta}>
                  {formatEventDate(event.starts_at) +
                    " • " +
                    formatTime(event.starts_at) +
                    (event.ends_at
                      ? "–" + formatTime(event.ends_at)
                      : "")}
                </Text>

                {event.location_name ? (
                  <Text style={styles.eventLocation}>
                    {event.location_name}
                  </Text>
                ) : null}
              </View>

              <P.CaretRightIcon
                size={18}
                color="#9AA4AE"
                weight="bold"
              />
            </Pressable>
          ))}
        </View>
      )}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: eloColors.ink,
  },
  primaryAction: {
    marginTop: 20,
  },
  routineList: {
    gap: 9,
  },
  routineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  routineIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  routineCopy: {
    flex: 1,
  },
  routineMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: eloColors.muted,
  },
  routineLocation: {
    marginTop: 3,
    fontSize: 11,
    color: eloColors.muted,
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: eloColors.successSoft,
    fontSize: 9,
    fontWeight: "900",
    color: eloColors.green,
  },
  seriesBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 15,
    backgroundColor: "#F2F9FD",
  },
  seriesTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  seriesIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#E4F2FA",
  },
  seriesCopy: {
    flex: 1,
  },
  seriesName: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  seriesProgress: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.blue,
  },
  seriesEnd: {
    marginTop: 8,
    fontSize: 10,
    color: eloColors.muted,
  },
  addSeries: {
    minHeight: 42,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#B9D9EC",
    borderRadius: 13,
    backgroundColor: "#F7FBFE",
  },
  addSeriesText: {
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.blue,
  },
  loading: {
    paddingVertical: 45,
    alignItems: "center",
  },
  eventList: {
    gap: 9,
  },
  eventCard: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  dateBox: {
    width: 52,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: eloColors.surfaceSoft,
  },
  dateDay: {
    fontSize: 20,
    lineHeight: 23,
    fontWeight: "900",
    color: eloColors.ink,
  },
  dateMonth: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "900",
    color: eloColors.blue,
  },
  eventCopy: {
    flex: 1,
  },
  eventTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  eventTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  recurringBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#EAF5FB",
  },
  recurringBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: eloColors.blue,
  },
  eventMeta: {
    marginTop: 5,
    fontSize: 11,
    color: eloColors.muted,
  },
  eventLocation: {
    marginTop: 3,
    fontSize: 11,
    color: eloColors.muted,
  },
  pressed: {
    opacity: 0.76,
  },
});
