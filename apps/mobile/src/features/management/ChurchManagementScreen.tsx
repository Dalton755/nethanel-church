import {
    useState,
} from "react";

import {
    Alert,
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
    useOrganization,
} from "../../contexts/OrganizationContext";

import {
    AccessRolesScreen,
} from "./AccessRolesScreen";


type ChurchManagementScreenProps = {
    onBack:
    () => void;
};


type ManagementCardProps = {
    icon:
    keyof typeof Ionicons.glyphMap;

    title:
    string;

    description:
    string;

    badge?:
    string;

    onPress:
    () => void;
};


export function ChurchManagementScreen({
    onBack,
}: ChurchManagementScreenProps) {

    const [
        activeSection,
        setActiveSection,
    ] =
        useState<
            "home" | "roles"
        >("home");
    const {
        activeOrganization,
        canAtOrganization,
    } =
        useOrganization();


    const canManageSecurity =
        canAtOrganization(
            "security.manage"
        );


    const canManageOrganization =
        canAtOrganization(
            "organization.manage"
        );


    const canManageUnits =
        canAtOrganization(
            "units.manage"
        );


    const canViewAudit =
        canAtOrganization(
            "audit.view"
        );

    if (
        activeSection === "roles"
    ) {
        return (
            <AccessRolesScreen
                onBack={() =>
                    setActiveSection(
                        "home"
                    )
                }
            />
        );
    }


    function nextStep(
        title: string
    ) {
        Alert.alert(
            title,
            "Esta área já faz parte da Central de Gestão e será conectada na próxima etapa."
        );
    }


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
                        size={20}
                        color="#333333"
                    />

                    <Text
                        style={
                            styles.backText
                        }
                    >
                        Mais
                    </Text>
                </Pressable>


                <View
                    style={
                        styles.heading
                    }
                >
                    <Text
                        style={
                            styles.title
                        }
                    >
                        Gestão da Igreja
                    </Text>

                    <Text
                        style={
                            styles.organization
                        }
                    >
                        {
                            activeOrganization
                                ?.name
                        }
                    </Text>

                    <Text
                        style={
                            styles.description
                        }
                    >
                        Organize acessos, estrutura e configurações da sua igreja em um só lugar.
                    </Text>
                </View>


                <View
                    style={
                        styles.cards
                    }
                >
                    {canManageSecurity && (
                        <>
                            <ManagementCard
                                icon="people-outline"
                                title="Pessoas e acessos"
                                description="Defina quem pode entrar no sistema e qual acesso cada pessoa possui."
                                badge="Próxima etapa"
                                onPress={() =>
                                    nextStep(
                                        "Pessoas e acessos"
                                    )
                                }
                            />

                            <ManagementCard
                                icon="shield-checkmark-outline"
                                title="Perfis de acesso"
                                description="Configure Administrador, Secretaria, Tesouraria, Líderes e outros perfis."
                                badge="Disponível"
                                onPress={() =>
                                    setActiveSection(
                                        "roles"
                                    )
                                }
                            />
                        </>
                    )}


                    {(canManageOrganization ||
                        canManageSecurity) && (
                            <ManagementCard
                                icon="ribbon-outline"
                                title="Cargos e funções"
                                description="Organize funções como Pastor, Presbítero, Diácono, Professor e Tesoureiro."
                                badge="Em breve"
                                onPress={() =>
                                    nextStep(
                                        "Cargos e funções"
                                    )
                                }
                            />
                        )}


                    {canManageUnits && (
                        <ManagementCard
                            icon="business-outline"
                            title="Unidades"
                            description="Gerencie sede, congregações e demais unidades da organização."
                            badge="Em breve"
                            onPress={() =>
                                nextStep(
                                    "Unidades"
                                )
                            }
                        />
                    )}


                    {(canManageOrganization ||
                        canManageSecurity) && (
                            <ManagementCard
                                icon="grid-outline"
                                title="Departamentos"
                                description="Organize EBD, Louvor, Jovens, Infantil e os demais ministérios."
                                badge="Em breve"
                                onPress={() =>
                                    nextStep(
                                        "Departamentos"
                                    )
                                }
                            />
                        )}


                    {canManageOrganization && (
                        <ManagementCard
                            icon="settings-outline"
                            title="Configurações da igreja"
                            description="Dados institucionais e preferências gerais da organização."
                            badge="Em breve"
                            onPress={() =>
                                nextStep(
                                    "Configurações da igreja"
                                )
                            }
                        />
                    )}


                    {canViewAudit && (
                        <ManagementCard
                            icon="time-outline"
                            title="Histórico administrativo"
                            description="Consulte alterações importantes realizadas dentro da igreja."
                            badge="Em breve"
                            onPress={() =>
                                nextStep(
                                    "Histórico administrativo"
                                )
                            }
                        />
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}


function ManagementCard({
    icon,
    title,
    description,
    badge,
    onPress,
}: ManagementCardProps) {
    return (
        <Pressable
            onPress={
                onPress
            }
            style={({
                pressed,
            }) => [
                    styles.card,

                    pressed &&
                    styles.cardPressed,
                ]}
        >
            <View
                style={
                    styles.iconBox
                }
            >
                <Ionicons
                    name={
                        icon
                    }
                    size={22}
                    color="#393939"
                />
            </View>


            <View
                style={
                    styles.cardContent
                }
            >
                <View
                    style={
                        styles.cardTitleRow
                    }
                >
                    <Text
                        style={
                            styles.cardTitle
                        }
                    >
                        {title}
                    </Text>

                    {badge && (
                        <Text
                            style={
                                styles.badge
                            }
                        >
                            {badge}
                        </Text>
                    )}
                </View>


                <Text
                    style={
                        styles.cardDescription
                    }
                >
                    {description}
                </Text>
            </View>


            <Ionicons
                name="chevron-forward"
                size={18}
                color="#aaaaaa"
            />
        </Pressable>
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
                8,

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

        heading: {
            paddingTop:
                18,

            paddingBottom:
                26,
        },

        title: {
            fontSize:
                28,

            fontWeight:
                "700",

            color:
                "#111111",
        },

        organization: {
            marginTop:
                6,

            fontSize:
                14,

            fontWeight:
                "600",

            color:
                "#505050",
        },

        description: {
            marginTop:
                9,

            maxWidth:
                420,

            fontSize:
                14,

            lineHeight:
                21,

            color:
                "#747474",
        },

        cards: {
            gap:
                10,
        },

        card: {
            minHeight:
                92,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                13,

            padding:
                15,

            borderWidth:
                1,

            borderColor:
                "#e1e1de",

            borderRadius:
                14,

            backgroundColor:
                "#ffffff",
        },

        cardPressed: {
            opacity:
                0.76,
        },

        iconBox: {
            width:
                42,

            height:
                42,

            alignItems:
                "center",

            justifyContent:
                "center",

            borderRadius:
                12,

            backgroundColor:
                "#f0f0ed",
        },

        cardContent: {
            flex:
                1,
        },

        cardTitleRow: {
            flexDirection:
                "row",

            alignItems:
                "center",

            flexWrap:
                "wrap",

            gap:
                7,
        },

        cardTitle: {
            fontSize:
                15,

            fontWeight:
                "700",

            color:
                "#1b1b1b",
        },

        badge: {
            paddingHorizontal:
                7,

            paddingVertical:
                3,

            borderRadius:
                8,

            backgroundColor:
                "#eeeeeb",

            fontSize:
                10,

            fontWeight:
                "700",

            color:
                "#686868",
        },

        cardDescription: {
            marginTop:
                5,

            fontSize:
                12,

            lineHeight:
                18,

            color:
                "#747474",
        },
    });