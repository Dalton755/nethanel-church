import {
    useCallback,
    useMemo,
    useState,
} from "react";

import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
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
    PersonFormScreen,
} from "./PersonFormScreen";

import {
    PersonDetailsScreen,
} from "./PersonDetailsScreen";

import {
    MEMBERSHIP_LABELS,
    type MembershipType,
    type PersonListItem,
} from "./people.types";


type FilterType =
    | "all"
    | MembershipType;


const FILTERS: {
    value:
        FilterType;

    label:
        string;
}[] = [
    {
        value: "all",
        label: "Todos",
    },
    {
        value: "member",
        label: "Membros",
    },
    {
        value: "congregant",
        label: "Congregados",
    },
    {
        value: "visitor",
        label: "Visitantes",
    },
    {
        value: "minister",
        label: "Ministros",
    },
    {
        value: "staff",
        label: "Equipe",
    },
    {
        value: "other",
        label: "Outros",
    },
];


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


function searchNormalize(
    value: string
) {
    return value
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase();
}


export function PeopleScreen() {
    const {
        activeOrganization,
        activeUnit,
        permissions,
    } =
        useOrganization();


    const canView =
        permissions.includes(
            "people.view"
        ) ||
        permissions.includes(
            "people.manage"
        );


    const canManage =
        permissions.includes(
            "people.manage"
        );


    const [
        people,
        setPeople,
    ] =
        useState<
            PersonListItem[]
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
        search,
        setSearch,
    ] =
        useState(
            ""
        );


    const [
        filter,
        setFilter,
    ] =
        useState<FilterType>(
            "all"
        );


    const [
        creating,
        setCreating,
    ] =
        useState(
            false
        );


    const [
        editing,
        setEditing,
    ] =
        useState<
            PersonListItem
            | null
        >(
            null
        );


    const [
        viewing,
        setViewing,
    ] =
        useState<
            PersonListItem
            | null
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


    const loadPeople =
        useCallback(
            async () => {
                if (
                    !activeOrganization ||
                    !activeUnit ||
                    !canView
                ) {
                    setPeople(
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
                    await supabase.rpc(
                        "list_people",
                        {
                            p_organization_id:
                                activeOrganization.id,

                            p_unit_id:
                                activeUnit.id,
                        }
                    );


                if (error) {
                    setErrorMessage(
                        error.message
                    );

                    setPeople(
                        []
                    );
                } else {
                    setPeople(
                        (
                            data ??
                            []
                        ) as PersonListItem[]
                    );
                }


                setLoading(
                    false
                );
            },
            [
                activeOrganization,
                activeUnit,
                canView,
            ]
        );


    useFocusEffect(
        useCallback(
            () => {
                void loadPeople();
            },
            [
                loadPeople,
            ]
        )
    );


    const filteredPeople =
        useMemo(
            () => {
                const query =
                    searchNormalize(
                        search.trim()
                    );


                return people.filter(
                    (
                        person
                    ) => {
                        if (
                            filter !==
                                "all" &&
                            person.membership_type !==
                                filter
                        ) {
                            return false;
                        }


                        if (!query) {
                            return true;
                        }


                        const searchable =
                            searchNormalize(
                                [
                                    person.full_name,
                                    person.preferred_name,
                                    person.phone,
                                    person.email,
                                ]
                                    .filter(
                                        Boolean
                                    )
                                    .join(
                                        " "
                                    )
                            );


                        return searchable.includes(
                            query
                        );
                    }
                );
            },
            [
                people,
                search,
                filter,
            ]
        );


    async function handleSaved() {
        setCreating(
            false
        );

        setEditing(
            null
        );

        setViewing(
            null
        );

        await loadPeople();
    }


    function requestToggleActive(
        person:
            PersonListItem
    ) {
        const currentlyActive =
            person.record_status ===
            "active";


        Alert.alert(
            currentlyActive
                ? "Desativar pessoa?"
                : "Reativar pessoa?",

            currentlyActive
                ? `O cadastro de ${person.full_name} ficará inativo.`
                : `O cadastro de ${person.full_name} voltará a ficar ativo.`,

            [
                {
                    text:
                        "Cancelar",
                    style:
                        "cancel",
                },

                {
                    text:
                        currentlyActive
                            ? "Desativar"
                            : "Reativar",

                    style:
                        currentlyActive
                            ? "destructive"
                            : "default",

                    onPress:
                        () => {
                            void toggleActive(
                                person
                            );
                        },
                },
            ]
        );
    }


    async function toggleActive(
        person:
            PersonListItem
    ) {
        if (
            !activeOrganization
        ) {
            return;
        }


        const activate =
            person.record_status !==
            "active";


        const {
            error,
        } =
            await supabase.rpc(
                "set_person_active",
                {
                    p_person_id:
                        person.id,

                    p_organization_id:
                        activeOrganization.id,

                    p_active:
                        activate,
                }
            );


        if (error) {
            Alert.alert(
                "Não foi possível alterar o cadastro",
                error.message.includes(
                    "deactivate your own"
                )
                    ? "Você não pode desativar o seu próprio cadastro enquanto está usando a igreja."
                    : error.message
            );

            return;
        }


        setViewing(
            null
        );

        await loadPeople();
    }


    if (creating) {
        return (
            <PersonFormScreen
                onCancel={() =>
                    setCreating(
                        false
                    )
                }
                onSaved={
                    handleSaved
                }
            />
        );
    }


    if (editing) {
        return (
            <PersonFormScreen
                person={
                    editing
                }
                onCancel={() =>
                    setEditing(
                        null
                    )
                }
                onSaved={
                    handleSaved
                }
            />
        );
    }


    if (viewing) {
        return (
            <PersonDetailsScreen
                person={
                    viewing
                }
                unitName={
                    activeUnit?.name ??
                    ""
                }
                canManage={
                    canManage
                }
                onBack={() =>
                    setViewing(
                        null
                    )
                }
                onEdit={() => {
                    setEditing(
                        viewing
                    );

                    setViewing(
                        null
                    );
                }}
                onToggleActive={() =>
                    requestToggleActive(
                        viewing
                    )
                }
            />
        );
    }


    return (
        <SafeAreaView
            edges={["top"]}
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
                            Pessoas
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
                                setCreating(
                                    true
                                )
                            }
                            style={
                                styles.newButton
                            }
                        >
                            <Text
                                style={
                                    styles.newButtonText
                                }
                            >
                                + Nova pessoa
                            </Text>
                        </Pressable>
                    )}
                </View>


                {!canView ? (
                    <View
                        style={
                            styles.message
                        }
                    >
                        <Text
                            style={
                                styles.messageTitle
                            }
                        >
                            Acesso restrito
                        </Text>

                        <Text
                            style={
                                styles.messageText
                            }
                        >
                            Seu perfil não possui permissão para consultar pessoas.
                        </Text>
                    </View>
                ) : (
                    <>
                        <View
                            style={
                                styles.searchBox
                            }
                        >
                            <Ionicons
                                name="search-outline"
                                size={
                                    19
                                }
                                color="#777777"
                            />

                            <TextInput
                                value={
                                    search
                                }
                                onChangeText={
                                    setSearch
                                }
                                placeholder="Buscar por nome, telefone ou e-mail"
                                placeholderTextColor="#999999"
                                style={
                                    styles.searchInput
                                }
                            />

                            {search.length >
                                0 && (
                                <Pressable
                                    onPress={() =>
                                        setSearch(
                                            ""
                                        )
                                    }
                                >
                                    <Ionicons
                                        name="close-circle"
                                        size={
                                            19
                                        }
                                        color="#999999"
                                    />
                                </Pressable>
                            )}
                        </View>


                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={
                                false
                            }
                            contentContainerStyle={
                                styles.filters
                            }
                        >
                            {FILTERS.map(
                                (
                                    item
                                ) => (
                                    <Pressable
                                        key={
                                            item.value
                                        }
                                        onPress={() =>
                                            setFilter(
                                                item.value
                                            )
                                        }
                                        style={[
                                            styles.filter,

                                            filter ===
                                                item.value &&
                                                styles.filterSelected,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.filterText,

                                                filter ===
                                                    item.value &&
                                                    styles.filterTextSelected,
                                            ]}
                                        >
                                            {
                                                item.label
                                            }
                                        </Text>
                                    </Pressable>
                                )
                            )}
                        </ScrollView>


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
                                    styles.message
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
                                        void loadPeople();
                                    }}
                                >
                                    <Text
                                        style={
                                            styles.retry
                                        }
                                    >
                                        Tentar novamente
                                    </Text>
                                </Pressable>
                            </View>
                        ) : filteredPeople.length ===
                          0 ? (
                            <View
                                style={
                                    styles.message
                                }
                            >
                                <Text
                                    style={
                                        styles.messageTitle
                                    }
                                >
                                    Nenhuma pessoa encontrada
                                </Text>

                                <Text
                                    style={
                                        styles.messageText
                                    }
                                >
                                    {people.length ===
                                    0
                                        ? "Cadastre a primeira pessoa desta unidade."
                                        : "Tente alterar a busca ou o filtro."}
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
                                {filteredPeople.map(
                                    (
                                        person
                                    ) => {
                                        const active =
                                            person.record_status ===
                                            "active";


                                        return (
                                            <Pressable
                                                key={
                                                    person.id
                                                }
                                                onPress={() =>
                                                    setViewing(
                                                        person
                                                    )
                                                }
                                                style={({
                                                    pressed,
                                                }) => [
                                                    styles.person,

                                                    !active &&
                                                        styles.personInactive,

                                                    pressed &&
                                                        styles.personPressed,
                                                ]}
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


                                                <View
                                                    style={
                                                        styles.personContent
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.personName
                                                        }
                                                        numberOfLines={
                                                            1
                                                        }
                                                    >
                                                        {
                                                            person.full_name
                                                        }
                                                    </Text>


                                                    <Text
                                                        style={
                                                            styles.personMeta
                                                        }
                                                        numberOfLines={
                                                            1
                                                        }
                                                    >
                                                        {
                                                            MEMBERSHIP_LABELS[
                                                                person.membership_type
                                                            ]
                                                        }

                                                        {" • "}

                                                        {
                                                            activeUnit
                                                                ?.name
                                                        }
                                                    </Text>


                                                    {person.phone && (
                                                        <Text
                                                            style={
                                                                styles.phone
                                                            }
                                                        >
                                                            {
                                                                person.phone
                                                            }
                                                        </Text>
                                                    )}
                                                </View>


                                                {!active && (
                                                    <Text
                                                        style={
                                                            styles.inactive
                                                        }
                                                    >
                                                        Inativo
                                                    </Text>
                                                )}


                                                <Ionicons
                                                    name="chevron-forward"
                                                    size={
                                                        17
                                                    }
                                                    color="#aaaaaa"
                                                />
                                            </Pressable>
                                        );
                                    }
                                )}
                            </ScrollView>
                        )}
                    </>
                )}
            </View>
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

        container: {
            flex: 1,
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
                14,
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
                13,
            alignItems:
                "center",
            justifyContent:
                "center",
            borderRadius:
                10,
            backgroundColor:
                "#171717",
        },

        newButtonText: {
            fontSize:
                13,
            fontWeight:
                "700",
            color:
                "#ffffff",
        },

        searchBox: {
            minHeight:
                48,
            marginTop:
                24,
            flexDirection:
                "row",
            alignItems:
                "center",
            gap:
                9,
            paddingHorizontal:
                13,
            borderWidth:
                1,
            borderColor:
                "#ddddda",
            borderRadius:
                12,
            backgroundColor:
                "#ffffff",
        },

        searchInput: {
            flex: 1,
            fontSize:
                14,
            color:
                "#111111",
        },

        filters: {
            paddingTop:
                14,
            paddingBottom:
                10,
            gap:
                8,
        },

        filter: {
            height:
                34,
            paddingHorizontal:
                13,
            alignItems:
                "center",
            justifyContent:
                "center",
            borderWidth:
                1,
            borderColor:
                "#ddddda",
            borderRadius:
                17,
            backgroundColor:
                "#ffffff",
        },

        filterSelected: {
            borderColor:
                "#171717",
            backgroundColor:
                "#171717",
        },

        filterText: {
            fontSize:
                12,
            fontWeight:
                "600",
            color:
                "#555555",
        },

        filterTextSelected: {
            color:
                "#ffffff",
        },

        loading: {
            flex: 1,
            alignItems:
                "center",
            justifyContent:
                "center",
        },

        list: {
            paddingTop:
                4,
            paddingBottom:
                34,
            gap:
                8,
        },

        person: {
            minHeight:
                77,
            flexDirection:
                "row",
            alignItems:
                "center",
            gap:
                12,
            paddingHorizontal:
                13,
            paddingVertical:
                11,
            borderWidth:
                1,
            borderColor:
                "#e1e1de",
            borderRadius:
                13,
            backgroundColor:
                "#ffffff",
        },

        personInactive: {
            opacity:
                0.65,
        },

        personPressed: {
            opacity:
                0.78,
        },

        avatar: {
            width:
                42,
            height:
                42,
            alignItems:
                "center",
            justifyContent:
                "center",
            borderRadius:
                21,
            backgroundColor:
                "#ececea",
        },

        avatarText: {
            fontSize:
                14,
            fontWeight:
                "700",
            color:
                "#444444",
        },

        personContent: {
            flex: 1,
        },

        personName: {
            fontSize:
                15,
            fontWeight:
                "700",
            color:
                "#202020",
        },

        personMeta: {
            marginTop:
                3,
            fontSize:
                12,
            color:
                "#737373",
        },

        phone: {
            marginTop:
                3,
            fontSize:
                12,
            color:
                "#777777",
        },

        inactive: {
            fontSize:
                11,
            fontWeight:
                "700",
            color:
                "#777777",
        },

        message: {
            marginTop:
                30,
            paddingVertical:
                24,
            borderTopWidth:
                1,
            borderBottomWidth:
                1,
            borderColor:
                "#e2e2df",
        },

        messageTitle: {
            fontSize:
                15,
            fontWeight:
                "700",
        },

        messageText: {
            marginTop:
                7,
            fontSize:
                14,
            lineHeight:
                20,
            color:
                "#737373",
        },

        errorText: {
            fontSize:
                14,
            lineHeight:
                20,
            color:
                "#8b1e1e",
        },

        retry: {
            marginTop:
                12,
            fontSize:
                14,
            fontWeight:
                "700",
        },
    });