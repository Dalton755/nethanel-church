import {
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    Ionicons,
} from "@expo/vector-icons";

import {
    SafeAreaView,
} from "react-native-safe-area-context";

import type {
    ServiceEditorData,
} from "./NewServiceScreen";


type ServiceDetailsScreenProps = {
    service: ServiceEditorData;

    canManage: boolean;

    onBack: () => void;

    onEdit: () => void;

    onDelete: () => void;
};


function formatEventDate(
    isoValue: string
) {
    const formatted =
        new Intl.DateTimeFormat(
            "pt-BR",
            {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
            }
        ).format(
            new Date(
                isoValue
            )
        );

    return (
        formatted
            .charAt(0)
            .toUpperCase() +
        formatted.slice(1)
    );
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
    ).format(
        new Date(
            isoValue
        )
    );
}


export function ServiceDetailsScreen({
    service,
    canManage,
    onBack,
    onEdit,
    onDelete,
}: ServiceDetailsScreenProps) {
    return (
        <SafeAreaView
            edges={["top"]}
            style={styles.safeArea}
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
                    <Pressable
                        onPress={
                            onBack
                        }
                        style={({
                            pressed,
                        }) => [
                            styles.backButton,

                            pressed &&
                                styles.pressed,
                        ]}
                    >
                        <Ionicons
                            name="chevron-back"
                            size={21}
                            color="#222222"
                        />

                        <Text
                            style={
                                styles.backText
                            }
                        >
                            Agenda
                        </Text>
                    </Pressable>
                </View>


                <ScrollView
                    contentContainerStyle={
                        styles.content
                    }
                    showsVerticalScrollIndicator={
                        false
                    }
                >
                    {service.cover_image_url && (
                        <Image
                            source={{
                                uri:
                                    service.cover_image_url,
                            }}
                            style={
                                styles.cover
                            }
                        />
                    )}


                    <View
                        style={
                            styles.titleArea
                        }
                    >
                        <Text
                            style={
                                styles.title
                            }
                        >
                            {service.title}
                        </Text>

                        <Text
                            style={
                                styles.date
                            }
                        >
                            {formatEventDate(
                                service.starts_at
                            )}
                        </Text>
                    </View>


                    <View
                        style={
                            styles.summaryCard
                        }
                    >
                        <InfoRow
                            icon="time-outline"
                            label="Horário"
                            value={
                                service.ends_at
                                    ? `${formatTime(
                                          service.starts_at
                                      )} – ${formatTime(
                                          service.ends_at
                                      )}`
                                    : formatTime(
                                          service.starts_at
                                      )
                            }
                        />

                        <View
                            style={
                                styles.separator
                            }
                        />

                        <InfoRow
                            icon="location-outline"
                            label="Local"
                            value={
                                service.location_name ||
                                "Não informado"
                            }
                        />
                    </View>


                    <View
                        style={
                            styles.section
                        }
                    >
                        <Text
                            style={
                                styles.sectionTitle
                            }
                        >
                            Mensagem
                        </Text>


                        <DetailItem
                            label="Tema"
                            value={
                                service.theme
                            }
                            placeholder="Tema ainda não informado"
                        />

                        <DetailItem
                            label="Pregador"
                            value={
                                service.preacher_name
                            }
                            placeholder="Pregador ainda não informado"
                        />

                        <DetailItem
                            label="Referência bíblica"
                            value={
                                service.bible_reference
                            }
                            placeholder="Referência ainda não informada"
                        />
                    </View>


                    {canManage && (
                        <View
                            style={
                                styles.actions
                            }
                        >
                            <Pressable
                                onPress={
                                    onEdit
                                }
                                style={({
                                    pressed,
                                }) => [
                                    styles.editButton,

                                    pressed &&
                                        styles.pressed,
                                ]}
                            >
                                <Ionicons
                                    name="create-outline"
                                    size={18}
                                    color="#ffffff"
                                />

                                <Text
                                    style={
                                        styles.editButtonText
                                    }
                                >
                                    Editar culto
                                </Text>
                            </Pressable>


                            <Pressable
                                onPress={
                                    onDelete
                                }
                                style={({
                                    pressed,
                                }) => [
                                    styles.deleteButton,

                                    pressed &&
                                        styles.pressed,
                                ]}
                            >
                                <Ionicons
                                    name="trash-outline"
                                    size={18}
                                    color="#a02424"
                                />

                                <Text
                                    style={
                                        styles.deleteButtonText
                                    }
                                >
                                    Excluir
                                </Text>
                            </Pressable>
                        </View>
                    )}
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}


type InfoRowProps = {
    icon:
        | "time-outline"
        | "location-outline";

    label: string;

    value: string;
};


function InfoRow({
    icon,
    label,
    value,
}: InfoRowProps) {
    return (
        <View
            style={
                styles.infoRow
            }
        >
            <View
                style={
                    styles.infoIcon
                }
            >
                <Ionicons
                    name={icon}
                    size={19}
                    color="#555555"
                />
            </View>

            <View
                style={
                    styles.infoContent
                }
            >
                <Text
                    style={
                        styles.infoLabel
                    }
                >
                    {label}
                </Text>

                <Text
                    style={
                        styles.infoValue
                    }
                >
                    {value}
                </Text>
            </View>
        </View>
    );
}


type DetailItemProps = {
    label: string;

    value:
        | string
        | null;

    placeholder: string;
};


function DetailItem({
    label,
    value,
    placeholder,
}: DetailItemProps) {
    return (
        <View
            style={
                styles.detailItem
            }
        >
            <Text
                style={
                    styles.detailLabel
                }
            >
                {label}
            </Text>

            <Text
                style={[
                    styles.detailValue,

                    !value &&
                        styles.detailPlaceholder,
                ]}
            >
                {value || placeholder}
            </Text>
        </View>
    );
}


const styles =
    StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor:
                "#f7f7f6",
        },

        container: {
            flex: 1,
        },

        header: {
            paddingHorizontal:
                16,

            paddingTop:
                8,

            paddingBottom:
                8,
        },

        backButton: {
            alignSelf:
                "flex-start",

            minHeight:
                40,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                2,

            paddingHorizontal:
                4,
        },

        backText: {
            fontSize:
                14,

            fontWeight:
                "600",

            color:
                "#333333",
        },

        content: {
            paddingHorizontal:
                20,

            paddingBottom:
                40,
        },

        cover: {
            width:
                "100%",

            aspectRatio:
                16 / 9,

            marginTop:
                6,

            borderRadius:
                16,

            resizeMode:
                "contain",

            backgroundColor:
                "#ededeb",
        },

        titleArea: {
            paddingTop:
                24,

            paddingBottom:
                22,
        },

        title: {
            fontSize:
                28,

            lineHeight:
                34,

            fontWeight:
                "700",

            color:
                "#151515",
        },

        date: {
            marginTop:
                7,

            fontSize:
                14,

            color:
                "#707070",
        },

        summaryCard: {
            paddingHorizontal:
                16,

            borderWidth:
                1,

            borderColor:
                "#e1e1de",

            borderRadius:
                14,

            backgroundColor:
                "#ffffff",
        },

        infoRow: {
            minHeight:
                66,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                13,
        },

        infoIcon: {
            width:
                34,

            height:
                34,

            alignItems:
                "center",

            justifyContent:
                "center",

            borderRadius:
                10,

            backgroundColor:
                "#f3f3f1",
        },

        infoContent: {
            flex: 1,
        },

        infoLabel: {
            fontSize:
                12,

            fontWeight:
                "600",

            color:
                "#777777",
        },

        infoValue: {
            marginTop:
                3,

            fontSize:
                15,

            fontWeight:
                "600",

            color:
                "#222222",
        },

        separator: {
            height:
                1,

            marginLeft:
                47,

            backgroundColor:
                "#eeeeeb",
        },

        section: {
            marginTop:
                28,
        },

        sectionTitle: {
            marginBottom:
                4,

            fontSize:
                18,

            fontWeight:
                "700",

            color:
                "#1b1b1b",
        },

        detailItem: {
            paddingVertical:
                16,

            borderBottomWidth:
                1,

            borderBottomColor:
                "#e4e4e1",
        },

        detailLabel: {
            fontSize:
                12,

            fontWeight:
                "600",

            color:
                "#767676",
        },

        detailValue: {
            marginTop:
                5,

            fontSize:
                16,

            lineHeight:
                22,

            color:
                "#202020",
        },

        detailPlaceholder: {
            color:
                "#999999",

            fontStyle:
                "italic",
        },

        actions: {
            marginTop:
                30,

            gap:
                10,
        },

        editButton: {
            minHeight:
                52,

            flexDirection:
                "row",

            alignItems:
                "center",

            justifyContent:
                "center",

            gap:
                8,

            borderRadius:
                12,

            backgroundColor:
                "#171717",
        },

        editButtonText: {
            fontSize:
                15,

            fontWeight:
                "700",

            color:
                "#ffffff",
        },

        deleteButton: {
            minHeight:
                48,

            flexDirection:
                "row",

            alignItems:
                "center",

            justifyContent:
                "center",

            gap:
                7,

            borderRadius:
                12,

            backgroundColor:
                "#fff1f1",
        },

        deleteButtonText: {
            fontSize:
                14,

            fontWeight:
                "700",

            color:
                "#a02424",
        },

        pressed: {
            opacity:
                0.72,
        },
    });