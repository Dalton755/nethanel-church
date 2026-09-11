import {
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

import {
    MEMBERSHIP_LABELS,
    type PersonListItem,
} from "./people.types";


type PersonDetailsScreenProps = {
    person:
        PersonListItem;

    unitName:
        string;

    canManage:
        boolean;

    onBack:
        () => void;

    onEdit:
        () => void;

    onToggleActive:
        () => void;
};


function initials(
    name: string
) {
    const parts =
        name
            .trim()
            .split(/\s+/);

    return (
        (
            parts[0]?.[0] ??
            ""
        ) +
        (
            parts.length >
            1
                ? parts[
                      parts.length -
                          1
                  ]?.[0] ??
                  ""
                : ""
        )
    ).toUpperCase();
}


function birthDateLabel(
    value:
        string | null
) {
    if (!value) {
        return "Não informada";
    }

    const [
        year,
        month,
        day,
    ] =
        value
            .split("-")
            .map(Number);

    return new Intl.DateTimeFormat(
        "pt-BR"
    ).format(
        new Date(
            year,
            month - 1,
            day
        )
    );
}


export function PersonDetailsScreen({
    person,
    unitName,
    canManage,
    onBack,
    onEdit,
    onToggleActive,
}: PersonDetailsScreenProps) {
    const active =
        person.record_status ===
        "active";


    return (
        <SafeAreaView
            edges={["top"]}
            style={
                styles.safeArea
            }
        >
            <ScrollView
                contentContainerStyle={
                    styles.content
                }
                showsVerticalScrollIndicator={
                    false
                }
            >
                <Pressable
                    onPress={
                        onBack
                    }
                    style={
                        styles.back
                    }
                >
                    <Ionicons
                        name="chevron-back"
                        size={
                            20
                        }
                        color="#333333"
                    />

                    <Text
                        style={
                            styles.backText
                        }
                    >
                        Pessoas
                    </Text>
                </Pressable>


                <View
                    style={
                        styles.identity
                    }
                >
                    <View
                        style={
                            styles.avatar
                        }
                    >
                        <Text
                            style={
                                styles.avatarText
                            }
                        >
                            {initials(
                                person.full_name
                            )}
                        </Text>
                    </View>


                    <Text
                        style={
                            styles.name
                        }
                    >
                        {
                            person.full_name
                        }
                    </Text>


                    {person.preferred_name && (
                        <Text
                            style={
                                styles.preferredName
                            }
                        >
                            {
                                person.preferred_name
                            }
                        </Text>
                    )}


                    <View
                        style={
                            styles.badges
                        }
                    >
                        <Text
                            style={
                                styles.membershipBadge
                            }
                        >
                            {
                                MEMBERSHIP_LABELS[
                                    person.membership_type
                                ]
                            }
                        </Text>

                        <Text
                            style={[
                                styles.statusBadge,

                                !active &&
                                    styles.inactiveBadge,
                            ]}
                        >
                            {active
                                ? "Ativo"
                                : "Inativo"}
                        </Text>
                    </View>
                </View>


                <View
                    style={
                        styles.details
                    }
                >
                    <Detail
                        label="Telefone"
                        value={
                            person.phone ||
                            "Não informado"
                        }
                    />

                    <Detail
                        label="E-mail"
                        value={
                            person.email ||
                            "Não informado"
                        }
                    />

                    <Detail
                        label="Nascimento"
                        value={birthDateLabel(
                            person.birth_date
                        )}
                    />

                    <Detail
                        label="Unidade"
                        value={
                            unitName
                        }
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
                            style={
                                styles.editButton
                            }
                        >
                            <Ionicons
                                name="create-outline"
                                size={
                                    18
                                }
                                color="#ffffff"
                            />

                            <Text
                                style={
                                    styles.editText
                                }
                            >
                                Editar pessoa
                            </Text>
                        </Pressable>


                        <Pressable
                            onPress={
                                onToggleActive
                            }
                            style={
                                styles.statusButton
                            }
                        >
                            <Text
                                style={
                                    styles.statusButtonText
                                }
                            >
                                {active
                                    ? "Desativar cadastro"
                                    : "Reativar cadastro"}
                            </Text>
                        </Pressable>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}


function Detail({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <View
            style={
                styles.detail
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
                style={
                    styles.detailValue
                }
            >
                {value}
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

        content: {
            paddingHorizontal:
                20,
            paddingTop:
                10,
            paddingBottom:
                40,
        },

        back: {
            minHeight:
                42,
            flexDirection:
                "row",
            alignItems:
                "center",
            alignSelf:
                "flex-start",
        },

        backText: {
            fontSize:
                14,
            fontWeight:
                "600",
            color:
                "#333333",
        },

        identity: {
            alignItems:
                "center",
            paddingTop:
                22,
            paddingBottom:
                28,
        },

        avatar: {
            width:
                70,
            height:
                70,
            alignItems:
                "center",
            justifyContent:
                "center",
            borderRadius:
                35,
            backgroundColor:
                "#e8e8e5",
        },

        avatarText: {
            fontSize:
                23,
            fontWeight:
                "700",
            color:
                "#333333",
        },

        name: {
            marginTop:
                15,
            fontSize:
                24,
            fontWeight:
                "700",
            textAlign:
                "center",
            color:
                "#161616",
        },

        preferredName: {
            marginTop:
                4,
            fontSize:
                14,
            color:
                "#707070",
        },

        badges: {
            marginTop:
                12,
            flexDirection:
                "row",
            gap:
                7,
        },

        membershipBadge: {
            paddingHorizontal:
                10,
            paddingVertical:
                5,
            borderRadius:
                12,
            backgroundColor:
                "#ebebe8",
            fontSize:
                12,
            fontWeight:
                "700",
            color:
                "#444444",
        },

        statusBadge: {
            paddingHorizontal:
                10,
            paddingVertical:
                5,
            borderRadius:
                12,
            backgroundColor:
                "#e8f3e9",
            fontSize:
                12,
            fontWeight:
                "700",
            color:
                "#37663c",
        },

        inactiveBadge: {
            backgroundColor:
                "#eeeeec",
            color:
                "#777777",
        },

        details: {
            borderTopWidth:
                1,
            borderTopColor:
                "#e2e2df",
        },

        detail: {
            paddingVertical:
                16,
            borderBottomWidth:
                1,
            borderBottomColor:
                "#e2e2df",
        },

        detailLabel: {
            fontSize:
                12,
            fontWeight:
                "600",
            color:
                "#777777",
        },

        detailValue: {
            marginTop:
                5,
            fontSize:
                16,
            color:
                "#202020",
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

        editText: {
            fontSize:
                15,
            fontWeight:
                "700",
            color:
                "#ffffff",
        },

        statusButton: {
            minHeight:
                48,
            alignItems:
                "center",
            justifyContent:
                "center",
            borderWidth:
                1,
            borderColor:
                "#ddddda",
            borderRadius:
                12,
            backgroundColor:
                "#ffffff",
        },

        statusButtonText: {
            fontSize:
                14,
            fontWeight:
                "700",
            color:
                "#555555",
        },
    });