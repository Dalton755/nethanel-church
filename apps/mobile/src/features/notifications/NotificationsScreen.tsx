import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Ionicons,
} from "@expo/vector-icons";

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

import {
  requestAndRegisterPush,
  type PushRegistrationStatus,
} from "./PushNotificationRegistration";


type NotificationCategory =
  | "schedule"
  | "event"
  | "kids"
  | "community"
  | "care"
  | "system"
  | "communication";


type NotificationItem = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  data: Record<
    string,
    unknown
  >;
  read_at: string | null;
  created_at: string;
};


const CATEGORY_META:
  Record<
    NotificationCategory,
    {
      label: string;
      icon:
        | "calendar-outline"
        | "ticket-outline"
        | "happy-outline"
        | "megaphone-outline"
        | "heart-outline"
        | "shield-checkmark-outline"
        | "chatbubble-ellipses-outline";
    }
  > = {
    schedule: {
      label: "Escalas",
      icon: "calendar-outline",
    },

    event: {
      label: "Eventos",
      icon: "ticket-outline",
    },

    kids: {
      label: "Elo Kids",
      icon: "happy-outline",
    },

    community: {
      label: "Comunidade",
      icon: "megaphone-outline",
    },

    care: {
      label: "Cuidado",
      icon: "heart-outline",
    },

    system: {
      label: "Sistema",
      icon: "shield-checkmark-outline",
    },

    communication: {
      label: "Comunicado",
      icon: "chatbubble-ellipses-outline",
    },
  };


function formatDateTime(
  isoValue: string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(
    new Date(
      isoValue
    )
  );
}


function pushStatusMessage(
  status:
    PushRegistrationStatus | null
) {
  switch (status) {
    case "registered":
      return "Notificações do aparelho ativadas.";

    case "permission_denied":
      return "A permissão de notificações não foi concedida.";

    case "missing_project_id":
      return "O push está pronto, mas falta vincular este app ao projeto EAS.";

    case "unsupported_platform":
      return "Push disponível apenas no Android e iPhone.";

    case "error":
      return "Não foi possível ativar o push agora.";

    default:
      return null;
  }
}


export function NotificationsScreen() {
  const {
    activeOrganization,
  } =
    useOrganization();


  const [
    notifications,
    setNotifications,
  ] =
    useState<
      NotificationItem[]
    >([]);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<
      string | null
    >(null);


  const [
    pushStatus,
    setPushStatus,
  ] =
    useState<
      PushRegistrationStatus | null
    >(null);


  const [
    activatingPush,
    setActivatingPush,
  ] =
    useState(false);


  const unreadCount =
    useMemo(
      () =>
        notifications.filter(
          (
            notification
          ) =>
            !notification.read_at
        ).length,
      [
        notifications,
      ]
    );


  const loadNotifications =
    useCallback(
      async (
        mode:
          | "loading"
          | "refresh" =
          "loading"
      ) => {
        const organizationId =
          activeOrganization?.id;


        if (
          !organizationId
        ) {
          setNotifications(
            []
          );

          setLoading(
            false
          );

          return;
        }


        if (
          mode === "loading"
        ) {
          setLoading(
            true
          );
        } else {
          setRefreshing(
            true
          );
        }


        setErrorMessage(
          null
        );


        try {
          const {
            data,
            error,
          } =
            await supabase
              .from(
                "notifications"
              )
              .select(
                "id,category,title,body,data,read_at,created_at"
              )
              .eq(
                "organization_id",
                organizationId
              )
              .is(
                "archived_at",
                null
              )
              .order(
                "created_at",
                {
                  ascending:
                    false,
                }
              )
              .limit(100);


          if (error) {
            throw error;
          }


          setNotifications(
            (data ??
              []) as NotificationItem[]
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar as notificações."
          );
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [
        activeOrganization?.id,
      ]
    );


  useFocusEffect(
    useCallback(
      () => {
        void loadNotifications();
      },
      [
        loadNotifications,
      ]
    )
  );


  useEffect(() => {
    const organizationId =
      activeOrganization?.id;


    if (
      !organizationId
    ) {
      return;
    }


    const channel =
      supabase
        .channel(
          `notifications-screen-${organizationId}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "notifications",
            filter:
              `organization_id=eq.${organizationId}`,
          },
          () => {
            void loadNotifications(
              "refresh"
            );
          }
        )
        .subscribe();


    return () => {
      void supabase
        .removeChannel(
          channel
        );
    };
  }, [
    activeOrganization?.id,
    loadNotifications,
  ]);


  async function handleRead(
    notification:
      NotificationItem
  ) {
    if (
      notification.read_at
    ) {
      return;
    }


    setNotifications(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            notification.id
              ? {
                  ...item,
                  read_at:
                    new Date()
                      .toISOString(),
                }
              : item
        )
    );


    const {
      error,
    } =
      await supabase.rpc(
        "mark_notification_read",
        {
          p_notification_id:
            notification.id,
        }
      );


    if (error) {
      void loadNotifications(
        "refresh"
      );
    }
  }


  async function handleReadAll() {
    const organizationId =
      activeOrganization?.id;


    if (
      !organizationId ||
      unreadCount === 0
    ) {
      return;
    }


    const now =
      new Date()
        .toISOString();


    setNotifications(
      (
        current
      ) =>
        current.map(
          (
            item
          ) => ({
            ...item,
            read_at:
              item.read_at ??
              now,
          })
        )
    );


    const {
      error,
    } =
      await supabase.rpc(
        "mark_all_notifications_read",
        {
          p_organization_id:
            organizationId,
        }
      );


    if (error) {
      void loadNotifications(
        "refresh"
      );
    }
  }


  async function handleEnablePush() {
    const organizationId =
      activeOrganization?.id;


    if (
      !organizationId
    ) {
      return;
    }


    setActivatingPush(
      true
    );


    try {
      const status =
        await requestAndRegisterPush(
          organizationId
        );


      setPushStatus(
        status
      );
    } finally {
      setActivatingPush(
        false
      );
    }
  }


  const statusMessage =
    pushStatusMessage(
      pushStatus
    );


  return (
    <SafeAreaView
      edges={[
        "top",
        "bottom",
      ]}
      style={
        styles.safeArea
      }
    >
      <View
        style={
          styles.header
        }
      >
        <View>
          <Text
            style={
              styles.title
            }
          >
            Notificações
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            {unreadCount >
            0
              ? `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`
              : "Tudo em dia"}
          </Text>
        </View>


        {unreadCount >
          0 && (
          <Pressable
            onPress={() => {
              void handleReadAll();
            }}
            style={({
              pressed,
            }) => [
              styles.readAllButton,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.readAllText
              }
            >
              Marcar todas
            </Text>
          </Pressable>
        )}
      </View>


      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              void loadNotifications(
                "refresh"
              );
            }}
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={
            styles.pushCard
          }
        >
          <View
            style={
              styles.pushIcon
            }
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color="#252525"
            />
          </View>


          <View
            style={
              styles.pushContent
            }
          >
            <Text
              style={
                styles.pushTitle
              }
            >
              Alertas no celular
            </Text>

            <Text
              style={
                styles.pushDescription
              }
            >
              Receba escalas, eventos e chamadas do Elo Kids mesmo com o app fechado.
            </Text>

            {statusMessage && (
              <Text
                style={
                  styles.pushStatus
                }
              >
                {statusMessage}
              </Text>
            )}
          </View>


          <Pressable
            disabled={
              activatingPush
            }
            onPress={() => {
              void handleEnablePush();
            }}
            style={({
              pressed,
            }) => [
              styles.pushButton,

              pressed &&
                styles.pressed,

              activatingPush &&
                styles.disabled,
            ]}
          >
            {activatingPush ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <Text
                style={
                  styles.pushButtonText
                }
              >
                Ativar
              </Text>
            )}
          </Pressable>
        </View>


        {loading ? (
          <View
            style={
              styles.loading
            }
          >
            <ActivityIndicator />
          </View>
        ) : errorMessage ? (
          <View
            style={
              styles.messageCard
            }
          >
            <Text
              style={
                styles.errorText
              }
            >
              {errorMessage}
            </Text>
          </View>
        ) : notifications.length ===
          0 ? (
          <View
            style={
              styles.empty
            }
          >
            <View
              style={
                styles.emptyIcon
              }
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={27}
                color="#555555"
              />
            </View>

            <Text
              style={
                styles.emptyTitle
              }
            >
              Nada novo por aqui
            </Text>

            <Text
              style={
                styles.emptyDescription
              }
            >
              Escalas, inscrições, comunicados e alertas importantes aparecerão aqui.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.list
            }
          >
            {notifications.map(
              (
                notification
              ) => {
                const meta =
                  CATEGORY_META[
                    notification.category
                  ];


                const unread =
                  !notification.read_at;


                return (
                  <Pressable
                    key={
                      notification.id
                    }
                    onPress={() => {
                      void handleRead(
                        notification
                      );
                    }}
                    style={({
                      pressed,
                    }) => [
                      styles.notificationCard,

                      unread &&
                        styles.notificationUnread,

                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <View
                      style={
                        styles.notificationIcon
                      }
                    >
                      <Ionicons
                        name={
                          meta.icon
                        }
                        size={20}
                        color="#343434"
                      />
                    </View>


                    <View
                      style={
                        styles.notificationContent
                      }
                    >
                      <View
                        style={
                          styles.notificationMetaRow
                        }
                      >
                        <Text
                          style={
                            styles.category
                          }
                        >
                          {
                            meta.label
                          }
                        </Text>

                        <Text
                          style={
                            styles.time
                          }
                        >
                          {formatDateTime(
                            notification.created_at
                          )}
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.notificationTitle
                        }
                      >
                        {
                          notification.title
                        }
                      </Text>

                      <Text
                        style={
                          styles.notificationBody
                        }
                      >
                        {
                          notification.body
                        }
                      </Text>
                    </View>


                    {unread && (
                      <View
                        style={
                          styles.unreadDot
                        }
                      />
                    )}
                  </Pressable>
                );
              }
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#f7f7f6",
    },

    header: {
      minHeight: 78,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 16,
      paddingHorizontal:
        20,
      borderBottomWidth:
        1,
      borderBottomColor:
        "#e3e3e0",
      backgroundColor:
        "#f7f7f6",
    },

    title: {
      fontSize: 26,
      fontWeight: "700",
      color: "#111111",
    },

    subtitle: {
      marginTop: 3,
      fontSize: 13,
      color: "#737373",
    },

    readAllButton: {
      minHeight: 38,
      justifyContent:
        "center",
      paddingHorizontal:
        12,
      borderRadius: 10,
      backgroundColor:
        "#ecece8",
    },

    readAllText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#333333",
    },

    content: {
      paddingHorizontal:
        20,
      paddingTop: 16,
      paddingBottom: 36,
    },

    pushCard: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#dededb",
      borderRadius: 14,
      backgroundColor:
        "#ffffff",
    },

    pushIcon: {
      width: 40,
      height: 40,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 12,
      backgroundColor:
        "#f0f0ed",
    },

    pushContent: {
      flex: 1,
    },

    pushTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: "#222222",
    },

    pushDescription: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 17,
      color: "#6f6f6f",
    },

    pushStatus: {
      marginTop: 6,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "600",
      color: "#505050",
    },

    pushButton: {
      minWidth: 60,
      height: 38,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        12,
      borderRadius: 10,
      backgroundColor:
        "#1d1d1d",
    },

    pushButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#ffffff",
    },

    loading: {
      paddingVertical: 58,
      alignItems:
        "center",
    },

    messageCard: {
      marginTop: 14,
      padding: 15,
      borderRadius: 12,
      backgroundColor:
        "#fff1f1",
    },

    errorText: {
      fontSize: 13,
      lineHeight: 18,
      color: "#8b1e1e",
    },

    empty: {
      marginTop: 14,
      alignItems:
        "center",
      paddingHorizontal:
        24,
      paddingVertical: 42,
      borderWidth: 1,
      borderColor:
        "#e1e1de",
      borderRadius: 14,
      backgroundColor:
        "#ffffff",
    },

    emptyIcon: {
      width: 48,
      height: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 24,
      backgroundColor:
        "#f0f0ed",
    },

    emptyTitle: {
      marginTop: 14,
      fontSize: 16,
      fontWeight: "700",
      color: "#222222",
    },

    emptyDescription: {
      marginTop: 7,
      maxWidth: 280,
      textAlign: "center",
      fontSize: 13,
      lineHeight: 19,
      color: "#747474",
    },

    list: {
      marginTop: 14,
      gap: 9,
    },

    notificationCard: {
      minHeight: 92,
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 11,
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#e1e1de",
      borderRadius: 14,
      backgroundColor:
        "#ffffff",
    },

    notificationUnread: {
      borderColor:
        "#c9c9c4",
      backgroundColor:
        "#fbfbf8",
    },

    notificationIcon: {
      width: 38,
      height: 38,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 11,
      backgroundColor:
        "#f0f0ed",
    },

    notificationContent: {
      flex: 1,
    },

    notificationMetaRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 10,
    },

    category: {
      fontSize: 11,
      fontWeight: "700",
      textTransform:
        "uppercase",
      letterSpacing: 0.35,
      color: "#747474",
    },

    time: {
      fontSize: 11,
      color: "#8a8a8a",
    },

    notificationTitle: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "700",
      color: "#222222",
    },

    notificationBody: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 18,
      color: "#676767",
    },

    unreadDot: {
      width: 8,
      height: 8,
      marginTop: 5,
      borderRadius: 4,
      backgroundColor:
        "#222222",
    },

    pressed: {
      opacity: 0.72,
    },

    disabled: {
      opacity: 0.55,
    },
  });
