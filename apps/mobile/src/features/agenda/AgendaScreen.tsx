import {
    useCallback,
    useState,
} from "react";

import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
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

import {
    NewServiceScreen,
    type ServiceEditorData,
} from "./NewServiceScreen";

import {
    ServiceDetailsScreen,
} from "./ServiceDetailsScreen";


type AgendaEvent = {
    id: string;

    title: string;

    starts_at: string;

    ends_at: string | null;

    location_name: string | null;

    status: string;

    visibility: string;

    cover_image_path: string | null;

    cover_image_url: string | null;
};


function formatEventDate(
    isoValue: string
) {
    const date =
        new Date(
            isoValue
        );


    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            weekday:
                "long",

            day:
                "2-digit",

            month:
                "long",
        }
    ).format(
        date
    );
}


function formatTime(
    isoValue: string
) {
    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            hour:
                "2-digit",

            minute:
                "2-digit",
        }
    ).format(
        new Date(
            isoValue
        )
    );
}


export function AgendaScreen() {
    const {
        activeOrganization,
        activeUnit,
        permissions,
    } =
        useOrganization();


    const [
        events,
        setEvents,
    ] =
        useState<
            AgendaEvent[]
        >(
            []
        );


    const [
        loading,
        setLoading,
    ] =
        useState(
            true
        );


    const [
        creatingService,
        setCreatingService,
    ] =
        useState(
            false
        );


    const [
        editingService,
        setEditingService,
    ] =
        useState<
            ServiceEditorData
            | null
        >(
            null
        );

    const [
        viewingService,
        setViewingService,
    ] =
        useState<
            ServiceEditorData
            | null
        >(
            null
        );


    const [
        actionEventId,
        setActionEventId,
    ] =
        useState<
            string | null
        >(
            null
        );


    const [
        errorMessage,
        setErrorMessage,
    ] =
        useState<
            string | null
        >(
            null
        );


    const canManage =
        permissions.includes(
            "agenda.manage"
        ) &&
        permissions.includes(
            "services.manage"
        );


    const loadEvents =
        useCallback(
            async () => {
                if (
                    !activeOrganization ||
                    !activeUnit
                ) {
                    setEvents(
                        []
                    );

                    setLoading(
                        false
                    );

                    return;
                }


                setLoading(
                    true
                );

                setErrorMessage(
                    null
                );


                const {
                    data,
                    error,
                } =
                    await supabase
                        .from(
                            "events"
                        )
                        .select(
                            `
                            id,
                            title,
                            starts_at,
                            ends_at,
                            location_name,
                            status,
                            visibility,
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
                                24 *
                                60 *
                                60 *
                                1000
                            ).toISOString()
                        )
                        .order(
                            "starts_at",
                            {
                                ascending:
                                    true,
                            }
                        );


                if (error) {
                    setErrorMessage(
                        error.message
                    );

                    setEvents(
                        []
                    );

                    setLoading(
                        false
                    );

                    return;
                }


                const rawEvents =
                    (
                        data ??
                        []
                    ) as Omit<
                        AgendaEvent,
                        "cover_image_url"
                    >[];


                const eventsWithImages =
                    await Promise.all(
                        rawEvents.map(
                            async (
                                event
                            ) => {
                                if (
                                    !event
                                        .cover_image_path
                                ) {
                                    return {
                                        ...event,

                                        cover_image_url:
                                            null,
                                    };
                                }


                                const {
                                    data:
                                    signedData,
                                } =
                                    await supabase.storage
                                        .from(
                                            "event-covers"
                                        )
                                        .createSignedUrl(
                                            event.cover_image_path,
                                            60 *
                                            60
                                        );


                                return {
                                    ...event,

                                    cover_image_url:
                                        signedData
                                            ?.signedUrl ??
                                        null,
                                };
                            }
                        )
                    );


                setEvents(
                    eventsWithImages
                );

                setLoading(
                    false
                );
            },
            [
                activeOrganization,
                activeUnit,
            ]
        );


    useFocusEffect(
        useCallback(
            () => {
                void loadEvents();
            },
            [
                loadEvents,
            ]
        )
    );


    async function handleSaved() {
        setCreatingService(
            false
        );

        setEditingService(
            null
        );

        await loadEvents();
    }


    async function loadServiceDetails(
        event: AgendaEvent
    ) {
        if (
            !activeOrganization
        ) {
            return null;
        }

        const {
            data,
            error,
        } =
            await supabase
                .from(
                    "services"
                )
                .select(
                    `
                theme,
                preacher_name,
                bible_reference,
                livestream_url,
                notes
                `
                )
                .eq(
                    "event_id",
                    event.id
                )
                .eq(
                    "organization_id",
                    activeOrganization.id
                )
                .maybeSingle();

        if (error) {
            throw error;
        }

        const result:
            ServiceEditorData = {
            id:
                event.id,

            title:
                event.title,

            starts_at:
                event.starts_at,

            ends_at:
                event.ends_at,

            location_name:
                event.location_name,

            visibility:
                event.visibility,

            cover_image_path:
                event.cover_image_path,

            cover_image_url:
                event.cover_image_url,

            theme:
                data?.theme ??
                null,

            preacher_name:
                data
                    ?.preacher_name ??
                null,

            bible_reference:
                data
                    ?.bible_reference ??
                null,

            livestream_url:
                data
                    ?.livestream_url ??
                null,

            notes:
                data?.notes ??
                null,
        };

        return result;
    }


    async function handleOpenDetails(
        event: AgendaEvent
    ) {
        setActionEventId(
            event.id
        );

        setErrorMessage(
            null
        );

        try {
            const service =
                await loadServiceDetails(
                    event
                );

            if (service) {
                setViewingService(
                    service
                );
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Não foi possível abrir os detalhes do culto.";

            setErrorMessage(
                message
            );
        } finally {
            setActionEventId(
                null
            );
        }
    }


    async function handleEdit(
        event: AgendaEvent
    ) {
        setActionEventId(
            event.id
        );

        setErrorMessage(
            null
        );

        try {
            const service =
                await loadServiceDetails(
                    event
                );

            if (service) {
                setEditingService(
                    service
                );
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Não foi possível abrir o culto para edição.";

            setErrorMessage(
                message
            );
        } finally {
            setActionEventId(
                null
            );
        }
    }


    function handleDeleteRequest(
        event: AgendaEvent
    ) {
        Alert.alert(
            "Excluir culto?",
            `Deseja excluir “${event.title}”? O culto e suas informações serão removidos. Esta ação não pode ser desfeita.`,
            [
                {
                    text:
                        "Cancelar",

                    style:
                        "cancel",
                },

                {
                    text:
                        "Excluir",

                    style:
                        "destructive",

                    onPress:
                        () => {
                            void handleDelete(
                                event
                            );
                        },
                },
            ]
        );
    }


    async function handleDelete(
        event: AgendaEvent
    ) {
        if (
            !activeOrganization
        ) {
            return;
        }


        setActionEventId(
            event.id
        );

        setErrorMessage(
            null
        );


        try {
            const {
                data,
                error,
            } =
                await supabase.rpc(
                    "delete_service_event",
                    {
                        p_event_id:
                            event.id,

                        p_organization_id:
                            activeOrganization.id,
                    }
                );


            if (error) {
                throw error;
            }


            const deleted =
                data as {
                    cover_image_path?:
                    string | null;
                } | null;


            const coverPath =
                deleted
                    ?.cover_image_path ??
                event.cover_image_path;


            if (coverPath) {
                const {
                    error:
                    storageError,
                } =
                    await supabase.storage
                        .from(
                            "event-covers"
                        )
                        .remove([
                            coverPath,
                        ]);


                if (
                    storageError
                ) {
                    Alert.alert(
                        "Culto excluído",
                        "O culto foi removido, mas não foi possível limpar a imagem da capa. Isso poderá ser corrigido depois."
                    );
                }
            }


            await loadEvents();
            setViewingService(
                null
            );
        } catch (error) {
            const message =
                error instanceof
                    Error
                    ? error.message
                    : "Não foi possível excluir o culto.";


            setErrorMessage(
                message
            );
        } finally {
            setActionEventId(
                null
            );
        }
    }

    if (viewingService) {
        return (
            <ServiceDetailsScreen
                service={
                    viewingService
                }
                canManage={
                    canManage
                }
                onBack={() =>
                    setViewingService(
                        null
                    )
                }
                onEdit={() => {
                    setEditingService(
                        viewingService
                    );

                    setViewingService(
                        null
                    );
                }}
                onDelete={() => {
                    const event =
                        events.find(
                            (item) =>
                                item.id ===
                                viewingService.id
                        );

                    if (event) {
                        handleDeleteRequest(
                            event
                        );
                    }
                }}
            />
        );
    }


    if (
        creatingService ||
        editingService
    ) {
        return (
            <NewServiceScreen
                service={
                    editingService
                }
                onCancel={() => {
                    setCreatingService(
                        false
                    );

                    setEditingService(
                        null
                    );
                }}
                onSaved={
                    handleSaved
                }
            />
        );
    }


    return (
        <SafeAreaView
            edges={[
                "top",
            ]}
            style={
                styles.safeArea
            }
        >
            <View
                style={
                    styles.container
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
                            Agenda
                        </Text>

                        <Text
                            style={
                                styles.subtitle
                            }
                        >
                            {
                                activeUnit
                                    ?.name
                            }
                        </Text>
                    </View>


                    {canManage && (
                        <Pressable
                            onPress={() =>
                                setCreatingService(
                                    true
                                )
                            }
                            style={({ pressed }) => [
                                styles.newButton,

                                pressed &&
                                styles.buttonPressed,
                            ]}
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
                            styles.messageArea
                        }
                    >
                        <Text
                            style={
                                styles.errorText
                            }
                        >
                            {
                                errorMessage
                            }
                        </Text>

                        <Pressable
                            onPress={() => {
                                void loadEvents();
                            }}
                        >
                            <Text
                                style={
                                    styles.retryText
                                }
                            >
                                Tentar novamente
                            </Text>
                        </Pressable>
                    </View>
                ) : events.length ===
                    0 ? (
                    <View
                        style={
                            styles.empty
                        }
                    >
                        <Text
                            style={
                                styles.emptyTitle
                            }
                        >
                            Nenhum evento cadastrado
                        </Text>

                        <Text
                            style={
                                styles.emptyText
                            }
                        >
                            Cultos, reuniões, ensaios e outros compromissos aparecerão aqui.
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
                        {events.map(
                            (
                                event
                            ) => {
                                const actionLoading =
                                    actionEventId ===
                                    event.id;


                                return (
                                    <Pressable
                                        key={
                                            event.id
                                        }
                                        onPress={() => {
                                            if (
                                                actionEventId !==
                                                event.id
                                            ) {
                                                void handleOpenDetails(
                                                    event
                                                );
                                            }
                                        }}
                                        style={({
                                            pressed,
                                        }) => [
                                                styles.event,

                                                pressed &&
                                                styles.eventPressed,
                                            ]}
                                    >
                                        {event.cover_image_url && (
                                            <Image
                                                source={{
                                                    uri: event.cover_image_url,
                                                }}
                                                style={
                                                    styles.eventImage
                                                }
                                            />
                                        )}


                                        <Text
                                            style={
                                                styles.eventDate
                                            }
                                        >
                                            {formatEventDate(
                                                event.starts_at
                                            )}
                                        </Text>


                                        <Text
                                            style={
                                                styles.eventTitle
                                            }
                                        >
                                            {
                                                event.title
                                            }
                                        </Text>


                                        <Text
                                            style={
                                                styles.eventMeta
                                            }
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


                                        {canManage && (
                                            <View
                                                style={
                                                    styles.actions
                                                }
                                            >
                                                {actionLoading ? (
                                                    <ActivityIndicator
                                                        size="small"
                                                    />
                                                ) : (
                                                    <>
                                                        <Pressable
                                                            onPress={(
                                                                pressEvent
                                                            ) => {
                                                                pressEvent.stopPropagation();

                                                                void handleEdit(
                                                                    event
                                                                );
                                                            }}
                                                            style={({
                                                                pressed,
                                                            }) => [
                                                                    styles.editButton,

                                                                    pressed &&
                                                                    styles.buttonPressed,
                                                                ]}
                                                        >
                                                            <Text
                                                                style={
                                                                    styles.editButtonText
                                                                }
                                                            >
                                                                Editar
                                                            </Text>
                                                        </Pressable>


                                                        <Pressable
                                                            onPress={(
                                                                pressEvent
                                                            ) => {
                                                                pressEvent.stopPropagation();

                                                                handleDeleteRequest(
                                                                    event
                                                                );
                                                            }}
                                                            style={({
                                                                pressed,
                                                            }) => [
                                                                    styles.deleteButton,

                                                                    pressed &&
                                                                    styles.buttonPressed,
                                                                ]}
                                                        >
                                                            <Text
                                                                style={
                                                                    styles.deleteButtonText
                                                                }
                                                            >
                                                                Excluir
                                                            </Text>
                                                        </Pressable>
                                                    </>
                                                )}
                                            </View>
                                        )}
                                    </Pressable>
                                );
                            }
                        )}
                    </ScrollView>
                )}
            </View>
        </SafeAreaView>
    );
}


const styles =
    StyleSheet.create({
        safeArea: {
            flex:
                1,

            backgroundColor:
                "#f7f7f6",
        },

        container: {
            flex:
                1,

            paddingHorizontal:
                20,

            paddingTop:
                24,
        },

        header: {
            flexDirection:
                "row",

            alignItems:
                "center",

            justifyContent:
                "space-between",

            gap:
                16,
        },

        title: {
            fontSize:
                28,

            fontWeight:
                "700",

            color:
                "#111111",
        },

        subtitle: {
            marginTop:
                4,

            fontSize:
                13,

            color:
                "#727272",
        },

        newButton: {
            minHeight:
                40,

            paddingHorizontal:
                14,

            borderRadius:
                10,

            backgroundColor:
                "#171717",

            alignItems:
                "center",

            justifyContent:
                "center",
        },

        newButtonText: {
            fontSize:
                13,

            fontWeight:
                "700",

            color:
                "#ffffff",
        },

        buttonPressed: {
            opacity:
                0.7,
        },

        loading: {
            flex:
                1,

            alignItems:
                "center",

            justifyContent:
                "center",
        },

        messageArea: {
            marginTop:
                32,
        },

        retryText: {
            marginTop:
                14,

            fontSize:
                14,

            fontWeight:
                "700",
        },

        errorText: {
            fontSize:
                14,

            lineHeight:
                20,

            color:
                "#8b1e1e",
        },

        empty: {
            marginTop:
                34,

            paddingVertical:
                26,

            borderTopWidth:
                1,

            borderBottomWidth:
                1,

            borderColor:
                "#e2e2df",
        },

        emptyTitle: {
            fontSize:
                15,

            fontWeight:
                "700",
        },

        emptyText: {
            marginTop:
                7,

            fontSize:
                14,

            lineHeight:
                20,

            color:
                "#737373",
        },

        list: {
            paddingTop:
                28,

            paddingBottom:
                32,

            gap:
                12,
        },

        event: {
            padding:
                17,

            borderWidth:
                1,

            borderColor:
                "#e1e1de",

            borderRadius:
                14,

            backgroundColor:
                "#ffffff",
        },

        eventPressed: {
            opacity:
                0.82,

            transform: [
                {
                    scale:
                        0.995,
                },
            ],
        },

        eventImage: {
            width:
                "100%",

            aspectRatio:
                16 / 9,

            marginBottom:
                15,

            borderRadius:
                10,

            resizeMode:
                "contain",

            backgroundColor:
                "#f2f2f0",
        },

        eventDate: {
            fontSize:
                12,

            fontWeight:
                "700",

            color:
                "#707070",

            textTransform:
                "capitalize",
        },

        eventTitle: {
            marginTop:
                8,

            fontSize:
                17,

            fontWeight:
                "700",

            color:
                "#181818",
        },

        eventMeta: {
            marginTop:
                7,

            fontSize:
                14,

            lineHeight:
                20,

            color:
                "#696969",
        },

        actions: {
            minHeight:
                42,

            marginTop:
                16,

            paddingTop:
                14,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                10,

            borderTopWidth:
                1,

            borderTopColor:
                "#eeeeeb",
        },

        editButton: {
            flex:
                1,

            minHeight:
                40,

            alignItems:
                "center",

            justifyContent:
                "center",

            borderWidth:
                1,

            borderColor:
                "#d7d7d3",

            borderRadius:
                10,

            backgroundColor:
                "#ffffff",
        },

        editButtonText: {
            fontSize:
                13,

            fontWeight:
                "700",

            color:
                "#333333",
        },

        deleteButton: {
            minHeight:
                40,

            paddingHorizontal:
                18,

            alignItems:
                "center",

            justifyContent:
                "center",

            borderRadius:
                10,

            backgroundColor:
                "#fff2f2",
        },

        deleteButtonText: {
            fontSize:
                13,

            fontWeight:
                "700",

            color:
                "#a02424",
        },
    });