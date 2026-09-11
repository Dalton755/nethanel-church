import {
  useCallback,
  useState,
} from "react";

import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  useFocusEffect,
} from "@react-navigation/native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  useOrganization,
} from "../../contexts/OrganizationContext";

import {
  supabase,
} from "../../lib/supabase";

type HomeEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  cover_image_path: string | null;
};

type NextService = HomeEvent & {
  cover_image_url: string | null;
};

function formatTime(
  isoValue: string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(new Date(isoValue));
}

function getTodayRange() {
  const now = new Date();

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );

  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function HomeScreen() {
  const {
    profile,
    activeOrganization,
    activeUnit,
  } = useOrganization();

  const [
    nextService,
    setNextService,
  ] = useState<NextService | null>(
    null
  );

  const [
    todayEvents,
    setTodayEvents,
  ] = useState<HomeEvent[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const firstName =
    profile?.display_name
      ?.trim()
      .split(/\s+/)[0] ?? "";

  const today =
    new Intl.DateTimeFormat(
      "pt-BR",
      {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }
    ).format(new Date());

  const loadHome = useCallback(
    async () => {
      if (
        !activeOrganization ||
        !activeUnit
      ) {
        setNextService(null);
        setTodayEvents([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        // --------------------------------
        // Descobrir o tipo "Culto"
        // --------------------------------

        const {
          data: serviceType,
          error: serviceTypeError,
        } = await supabase
          .from("event_types")
          .select("id")
          .eq(
            "organization_id",
            activeOrganization.id
          )
          .eq("type_key", "service")
          .eq("is_active", true)
          .single();

        if (serviceTypeError) {
          throw serviceTypeError;
        }

        const nowIso =
          new Date().toISOString();

        const todayRange =
          getTodayRange();

        // --------------------------------
        // Próximo culto + agenda de hoje
        // --------------------------------

        const [
          nextServiceResponse,
          todayEventsResponse,
        ] = await Promise.all([
          supabase
            .from("events")
            .select(
              `
                id,
                title,
                starts_at,
                ends_at,
                location_name,
                cover_image_path
              `
            )
            .eq(
              "organization_id",
              activeOrganization.id
            )
            .eq(
              "unit_id",
              activeUnit.id
            )
            .eq(
              "event_type_id",
              serviceType.id
            )
            .eq(
              "status",
              "published"
            )
            .gte(
              "starts_at",
              nowIso
            )
            .order(
              "starts_at",
              {
                ascending: true,
              }
            )
            .limit(1)
            .maybeSingle(),

          supabase
            .from("events")
            .select(
              `
                id,
                title,
                starts_at,
                ends_at,
                location_name,
                cover_image_path
              `
            )
            .eq(
              "organization_id",
              activeOrganization.id
            )
            .eq(
              "unit_id",
              activeUnit.id
            )
            .neq(
              "status",
              "cancelled"
            )
            .gte(
              "starts_at",
              todayRange.start
            )
            .lt(
              "starts_at",
              todayRange.end
            )
            .order(
              "starts_at",
              {
                ascending: true,
              }
            ),
        ]);

        if (
          nextServiceResponse.error
        ) {
          throw nextServiceResponse.error;
        }

        if (
          todayEventsResponse.error
        ) {
          throw todayEventsResponse.error;
        }

        const rawNextService =
          nextServiceResponse.data as
            | HomeEvent
            | null;

        let nextServiceWithImage:
          | NextService
          | null = null;

        if (rawNextService) {
          let signedUrl:
            | string
            | null = null;

          if (
            rawNextService.cover_image_path
          ) {
            const {
              data: imageData,
              error: imageError,
            } =
              await supabase.storage
                .from(
                  "event-covers"
                )
                .createSignedUrl(
                  rawNextService.cover_image_path,
                  60 * 60
                );

            if (!imageError) {
              signedUrl =
                imageData?.signedUrl ??
                null;
            }
          }

          nextServiceWithImage = {
            ...rawNextService,
            cover_image_url:
              signedUrl,
          };
        }

        setNextService(
          nextServiceWithImage
        );

        setTodayEvents(
          (todayEventsResponse.data ??
            []) as HomeEvent[]
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a página inicial.";

        setErrorMessage(message);
        setNextService(null);
        setTodayEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [
      activeOrganization,
      activeUnit,
    ]
  );

  /*
   * Atualiza sempre que o usuário
   * retorna para a aba Início.
   */
  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, [loadHome])
  );

  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.safeArea}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.context}>
          <Text
            style={styles.organization}
          >
            {activeOrganization?.name}
          </Text>

          <Text style={styles.unit}>
            {activeUnit?.name}
          </Text>
        </View>

        <View style={styles.greeting}>
          <Text style={styles.title}>
            {firstName
              ? `Bom dia, ${firstName}`
              : "Bom dia"}
          </Text>

          <Text style={styles.date}>
            {today}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : errorMessage ? (
          <View style={styles.errorBox}>
            <Text
              style={styles.errorText}
            >
              {errorMessage}
            </Text>
          </View>
        ) : (
          <View style={styles.sections}>
            <View style={styles.section}>
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Próximo culto
              </Text>

              {nextService ? (
                <>
                  {nextService.cover_image_url && (
                    <Image
                      source={{
                        uri: nextService.cover_image_url,
                      }}
                      style={
                        styles.serviceImage
                      }
                    />
                  )}

                  <Text
                    style={
                      styles.serviceTitle
                    }
                  >
                    {nextService.title}
                  </Text>

                  <Text
                    style={
                      styles.serviceMeta
                    }
                  >
                    {new Intl.DateTimeFormat(
                      "pt-BR",
                      {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                      }
                    ).format(
                      new Date(
                        nextService.starts_at
                      )
                    )}
                  </Text>

                  <Text
                    style={
                      styles.serviceMeta
                    }
                  >
                    {formatTime(
                      nextService.starts_at
                    )}

                    {nextService.ends_at
                      ? ` – ${formatTime(
                          nextService.ends_at
                        )}`
                      : ""}

                    {nextService.location_name
                      ? ` • ${nextService.location_name}`
                      : ""}
                  </Text>
                </>
              ) : (
                <Text
                  style={
                    styles.sectionDescription
                  }
                >
                  Nenhum culto agendado.
                </Text>
              )}
            </View>

            <View style={styles.section}>
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Agenda de hoje
              </Text>

              {todayEvents.length ===
              0 ? (
                <Text
                  style={
                    styles.sectionDescription
                  }
                >
                  Nenhum compromisso para
                  hoje.
                </Text>
              ) : (
                <View
                  style={
                    styles.todayList
                  }
                >
                  {todayEvents
                    .slice(0, 3)
                    .map((event) => (
                      <View
                        key={event.id}
                        style={
                          styles.todayItem
                        }
                      >
                        <Text
                          style={
                            styles.todayTime
                          }
                        >
                          {formatTime(
                            event.starts_at
                          )}
                        </Text>

                        <Text
                          style={
                            styles.todayTitle
                          }
                          numberOfLines={1}
                        >
                          {event.title}
                        </Text>
                      </View>
                    ))}

                  {todayEvents.length >
                    3 && (
                    <Text
                      style={
                        styles.moreEvents
                      }
                    >
                      +
                      {todayEvents.length -
                        3}{" "}
                      compromisso
                      {todayEvents.length -
                        3 ===
                      1
                        ? ""
                        : "s"}
                    </Text>
                  )}
                </View>
              )}
            </View>

            <HomeSection
              title="Pendências"
              description="Você não possui pendências."
            />

            <HomeSection
              title="Avisos"
              description="Nenhum aviso publicado."
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type HomeSectionProps = {
  title: string;
  description: string;
};

function HomeSection({
  title,
  description,
}: HomeSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title}
      </Text>

      <Text
        style={
          styles.sectionDescription
        }
      >
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f6",
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 32,
  },

  context: {
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e2",
  },

  organization: {
    fontSize: 15,
    fontWeight: "700",
    color: "#181818",
  },

  unit: {
    marginTop: 3,
    fontSize: 13,
    color: "#737373",
  },

  greeting: {
    paddingTop: 28,
    paddingBottom: 26,
  },

  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "700",
    color: "#111111",
  },

  date: {
    marginTop: 5,
    fontSize: 14,
    color: "#707070",
  },

  loading: {
    paddingVertical: 60,
    alignItems: "center",
  },

  sections: {
    gap: 12,
  },

  section: {
    paddingHorizontal: 17,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#e1e1de",
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1d1d1d",
  },

  sectionDescription: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: "#737373",
  },

  serviceImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginTop: 14,
    marginBottom: 14,
    borderRadius: 10,
    resizeMode: "contain",
    backgroundColor: "#f2f2f0",
  },

  serviceTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#171717",
  },

  serviceMeta: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: "#6c6c6c",
    textTransform: "capitalize",
  },

  todayList: {
    marginTop: 12,
    gap: 10,
  },

  todayItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  todayTime: {
    width: 45,
    fontSize: 13,
    fontWeight: "700",
    color: "#666666",
  },

  todayTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#242424",
  },

  moreEvents: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "600",
    color: "#747474",
  },

  errorBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff1f1",
  },

  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#8b1e1e",
  },
});