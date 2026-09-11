import {
    useCallback,
    useEffect,
    useState,
} from "react";

import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";

import { NewServiceScreen } from "./NewServiceScreen";

type AgendaEvent = {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    location_name: string | null;
    status: string;
    cover_image_path: string | null;
    cover_image_url: string | null;
};

function formatEventDate(
    isoValue: string
) {
    const date = new Date(isoValue);

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            weekday: "long",
            day: "2-digit",
            month: "long",
        }
    ).format(date);
}

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

export function AgendaScreen() {
    const {
        activeOrganization,
        activeUnit,
        permissions,
    } = useOrganization();

    const [events, setEvents] =
        useState<AgendaEvent[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [
        creatingService,
        setCreatingService,
    ] = useState(false);

    const [
        errorMessage,
        setErrorMessage,
    ] = useState<string | null>(null);

    const canManage =
        permissions.includes(
            "agenda.manage"
        ) &&
        permissions.includes(
            "services.manage"
        );

    const loadEvents = useCallback(
        async () => {
            if (
                !activeOrganization ||
                !activeUnit
            ) {
                setEvents([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            setErrorMessage(null);

            const { data, error } =
                await supabase
                    .from("events")
                    .select(
                        `
                        id,
                        title,
                        starts_at,
                        ends_at,
                        location_name,
                        status,
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
                        new Date(
                            Date.now() -
                            24 * 60 * 60 * 1000
                        ).toISOString()
                    )
                    .order("starts_at", {
                        ascending: true,
                    });

            if (error) {
                setErrorMessage(
                    error.message
                );
                setEvents([]);
            } else {
                const rawEvents =
                    (data ?? []) as Omit<
                        AgendaEvent,
                        "cover_image_url"
                    >[];

                const eventsWithImages =
                    await Promise.all(
                        rawEvents.map(
                            async (event) => {
                                if (
                                    !event.cover_image_path
                                ) {
                                    return {
                                        ...event,
                                        cover_image_url: null,
                                    };
                                }

                                const {
                                    data: signedData,
                                    error: signedError,
                                } = await supabase.storage
                                    .from("event-covers")
                                    .createSignedUrl(
                                        event.cover_image_path,
                                        60 * 60
                                    );

                                console.log(
                                    "[EVENT COVER]",
                                    {
                                        title: event.title,
                                        path: event.cover_image_path,
                                        signedUrl: signedData?.signedUrl,
                                        error: signedError?.message,
                                    }
                                );

                                return {
                                    ...event,
                                    cover_image_url:
                                        signedData?.signedUrl ??
                                        null,
                                };
                            }
                        )
                    );

                setEvents(eventsWithImages);
            }

            setLoading(false);
        },
        [
            activeOrganization,
            activeUnit,
        ]
    );

    useEffect(() => {
        void loadEvents();
    }, [loadEvents]);

    async function handleCreated() {
        setCreatingService(false);
        await loadEvents();
    }

    if (creatingService) {
        return (
            <NewServiceScreen
                onCancel={() =>
                    setCreatingService(false)
                }
                onCreated={handleCreated}
            />
        );
    }

    return (
        <SafeAreaView
            edges={["top"]}
            style={styles.safeArea}
        >
            <View style={styles.container}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.title}>
                            Agenda
                        </Text>

                        <Text style={styles.subtitle}>
                            {activeUnit?.name}
                        </Text>
                    </View>

                    {canManage && (
                        <Pressable
                            onPress={() =>
                                setCreatingService(true)
                            }
                            style={styles.newButton}
                        >
                            <Text
                                style={
                                    styles.newButtonText
                                }
                            >
                                + Novo culto
                            </Text>
                        </Pressable>
                    )}
                </View>

                {loading ? (
                    <View style={styles.loading}>
                        <ActivityIndicator />
                    </View>
                ) : errorMessage ? (
                    <View style={styles.messageArea}>
                        <Text
                            style={styles.errorText}
                        >
                            {errorMessage}
                        </Text>

                        <Pressable
                            onPress={() => {
                                void loadEvents();
                            }}
                        >
                            <Text
                                style={styles.retryText}
                            >
                                Tentar novamente
                            </Text>
                        </Pressable>
                    </View>
                ) : events.length === 0 ? (
                    <View style={styles.empty}>
                        <Text
                            style={styles.emptyTitle}
                        >
                            Nenhum evento cadastrado
                        </Text>

                        <Text
                            style={styles.emptyText}
                        >
                            Cultos, reuniões, ensaios e
                            outros compromissos aparecerão
                            aqui.
                        </Text>
                    </View>
                ) : (
                    <ScrollView
                        contentContainerStyle={
                            styles.list
                        }
                        showsVerticalScrollIndicator={
                            false
                        }
                    >
                        {events.map((event) => (
                            <View
                                key={event.id}
                                style={styles.event}
                            >
                                {event.cover_image_url && (
                                    <Image
                                        source={{
                                            uri: event.cover_image_url,
                                        }}
                                        style={styles.eventImage}
                                    />
                                )}
                                <Text
                                    style={styles.eventDate}
                                >
                                    {formatEventDate(
                                        event.starts_at
                                    )}
                                </Text>

                                <Text
                                    style={styles.eventTitle}
                                >
                                    {event.title}
                                </Text>

                                <Text
                                    style={styles.eventMeta}
                                >
                                    {formatTime(
                                        event.starts_at
                                    )}

                                    {event.ends_at
                                        ? ` – ${formatTime(
                                            event.ends_at
                                        )}`
                                        : ""}

                                    {event.location_name
                                        ? ` • ${event.location_name}`
                                        : ""}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#f7f7f6",
    },

    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 24,
    },

    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent:
            "space-between",
        gap: 16,
    },

    title: {
        fontSize: 28,
        fontWeight: "700",
        color: "#111111",
    },

    subtitle: {
        marginTop: 4,
        fontSize: 13,
        color: "#727272",
    },

    newButton: {
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: "#171717",
        alignItems: "center",
        justifyContent: "center",
    },

    newButtonText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#ffffff",
    },

    loading: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },

    messageArea: {
        marginTop: 32,
    },

    retryText: {
        marginTop: 14,
        fontSize: 14,
        fontWeight: "700",
    },

    errorText: {
        fontSize: 14,
        lineHeight: 20,
        color: "#8b1e1e",
    },

    empty: {
        marginTop: 34,
        paddingVertical: 26,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: "#e2e2df",
    },

    emptyTitle: {
        fontSize: 15,
        fontWeight: "700",
    },

    emptyText: {
        marginTop: 7,
        fontSize: 14,
        lineHeight: 20,
        color: "#737373",
    },

    list: {
        paddingTop: 28,
        paddingBottom: 32,
        gap: 12,
    },

    event: {
        padding: 17,
        borderWidth: 1,
        borderColor: "#e1e1de",
        borderRadius: 14,
        backgroundColor: "#ffffff",
    },

    eventImage: {
        width: "100%",
        aspectRatio: 16 / 9,
        marginBottom: 15,
        borderRadius: 10,
        resizeMode: "contain",
        backgroundColor: "#f2f2f0",
    },

    eventDate: {
        fontSize: 12,
        fontWeight: "700",
        color: "#707070",
        textTransform: "capitalize",
    },

    eventTitle: {
        marginTop: 8,
        fontSize: 17,
        fontWeight: "700",
        color: "#181818",
    },

    eventMeta: {
        marginTop: 7,
        fontSize: 14,
        lineHeight: 20,
        color: "#696969",
    },
});