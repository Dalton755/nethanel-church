import {
    useCallback,
    useEffect,
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
    SafeAreaView,
} from "react-native-safe-area-context";

import {
    useOrganization,
} from "../../contexts/OrganizationContext";

import {
    supabase,
} from "../../lib/supabase";


type AccessAssignment = {
    assignment_id: string;

    role_id: string;

    role_name: string;

    role_key: string;

    is_owner: boolean;

    is_system: boolean;

    unit_id: string | null;

    unit_name: string | null;

    starts_at: string;

    ends_at: string | null;
};


type PersonAccessItem = {
    id: string;

    full_name: string;

    preferred_name: string | null;

    email: string | null;

    phone: string | null;

    record_status: string;

    auth_user_id: string | null;

    has_login: boolean;

    membership_type: string | null;

    membership_status: string | null;

    assignments: AccessAssignment[];
};


type PeopleAccessResponse = {
    people: PersonAccessItem[];
};


type PermissionItem = {
    permission_key: string;

    description: string;

    permission_scope:
    | "organization"
    | "unit";
};


type AccessRole = {
    id: string;

    name: string;

    role_key: string;

    description: string | null;

    is_owner: boolean;

    is_system: boolean;

    is_active: boolean;

    assigned_count: number;

    permissions: string[];
};


type AccessRolesResponse = {
    roles: AccessRole[];

    permissions: PermissionItem[];
};


type PeopleAccessScreenProps = {
    onBack:
    () => void;
};


const MEMBERSHIP_LABELS:
    Record<string, string> = {
    visitor:
        "Visitante",

    congregant:
        "Congregado",

    member:
        "Membro",

    minister:
        "Ministro",

    staff:
        "Equipe",

    other:
        "Outro",
};


function normalizeSearch(
    value: string
) {
    return value
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .trim();
}


function getInitials(
    name: string
) {
    const parts =
        name
            .trim()
            .split(/\s+/)
            .filter(Boolean);


    if (
        parts.length === 0
    ) {
        return "?";
    }


    if (
        parts.length === 1
    ) {
        return parts[0]
            .slice(0, 2)
            .toUpperCase();
    }


    return (
        parts[0][0] +
        parts[
        parts.length - 1
        ][0]
    ).toUpperCase();
}


function getErrorMessage(
    error: unknown
) {
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
    ) {
        const message =
            String(
                (
                    error as {
                        message: unknown;
                    }
                ).message
            );


        if (
            message.includes(
                "This role requires organization scope"
            )
        ) {
            return "Este perfil possui permissões administrativas da igreja e só pode ser concedido para toda a igreja.";
        }


        if (
            message.includes(
                "Owner access cannot be revoked here"
            )
        ) {
            return "O acesso do Proprietário é protegido.";
        }


        if (
            message.includes(
                "Owner access requires"
            )
        ) {
            return "O perfil Proprietário não pode ser concedido por esta tela.";
        }


        if (
            message.includes(
                "Insufficient security permission"
            )
        ) {
            return "Você não possui permissão para administrar acessos.";
        }


        return message;
    }


    return "Não foi possível concluir a operação.";
}


export function PeopleAccessScreen({
    onBack,
}: PeopleAccessScreenProps) {
    const {
        activeOrganization,
        activeUnit,
        canAtOrganization,
        refreshContext,
    } =
        useOrganization();


    const [
        people,
        setPeople,
    ] =
        useState<
            PersonAccessItem[]
        >([]);


    const [
        roles,
        setRoles,
    ] =
        useState<
            AccessRole[]
        >([]);


    const [
        permissions,
        setPermissions,
    ] =
        useState<
            PermissionItem[]
        >([]);


    const [
        loading,
        setLoading,
    ] =
        useState(true);


    const [
        search,
        setSearch,
    ] =
        useState("");


    const [
        selectedPerson,
        setSelectedPerson,
    ] =
        useState<
            PersonAccessItem | null
        >(null);


    const canManageSecurity =
        canAtOrganization(
            "security.manage"
        );


    const loadData =
        useCallback(
            async () => {
                if (
                    !activeOrganization
                ) {
                    return;
                }


                setLoading(
                    true
                );


                try {
                    const [
                        peopleResult,
                        rolesResult,
                    ] =
                        await Promise.all([
                            supabase.rpc(
                                "list_people_access",
                                {
                                    p_organization_id:
                                        activeOrganization.id,
                                }
                            ),

                            supabase.rpc(
                                "list_access_roles",
                                {
                                    p_organization_id:
                                        activeOrganization.id,
                                }
                            ),
                        ]);


                    if (
                        peopleResult.error
                    ) {
                        throw peopleResult.error;
                    }


                    if (
                        rolesResult.error
                    ) {
                        throw rolesResult.error;
                    }


                    const peopleResponse =
                        peopleResult.data as
                        | PeopleAccessResponse
                        | null;


                    const rolesResponse =
                        rolesResult.data as
                        | AccessRolesResponse
                        | null;


                    setPeople(
                        Array.isArray(
                            peopleResponse?.people
                        )
                            ? peopleResponse.people
                            : []
                    );


                    setRoles(
                        Array.isArray(
                            rolesResponse?.roles
                        )
                            ? rolesResponse.roles
                            : []
                    );


                    setPermissions(
                        Array.isArray(
                            rolesResponse?.permissions
                        )
                            ? rolesResponse.permissions
                            : []
                    );


                    if (
                        selectedPerson
                    ) {
                        const updatedPerson =
                            peopleResponse
                                ?.people
                                ?.find(
                                    (
                                        person
                                    ) =>
                                        person.id ===
                                        selectedPerson.id
                                ) ??
                            null;


                        setSelectedPerson(
                            updatedPerson
                        );
                    }
                } catch (error) {
                    Alert.alert(
                        "Pessoas e acessos",
                        getErrorMessage(
                            error
                        )
                    );
                } finally {
                    setLoading(
                        false
                    );
                }
            },
            [
                activeOrganization,
                selectedPerson?.id,
            ]
        );


    useEffect(() => {
        void loadData();
    }, [loadData]);


    const filteredPeople =
        useMemo(
            () => {
                const query =
                    normalizeSearch(
                        search
                    );


                if (!query) {
                    return people;
                }


                return people.filter(
                    (person) => {
                        const source =
                            normalizeSearch(
                                [
                                    person.full_name,
                                    person.preferred_name,
                                    person.email,
                                    person.phone,
                                ]
                                    .filter(Boolean)
                                    .join(" ")
                            );


                        return source.includes(
                            query
                        );
                    }
                );
            },
            [
                people,
                search,
            ]
        );


    if (
        selectedPerson
    ) {
        return (
            <PersonAccessEditor
                organizationId={
                    activeOrganization?.id ??
                    ""
                }

                person={
                    selectedPerson
                }

                roles={
                    roles
                }

                permissions={
                    permissions
                }

                units={
                    activeOrganization?.units ??
                    []
                }

                defaultUnitId={
                    activeUnit?.id ??
                    null
                }

                onBack={() =>
                    setSelectedPerson(
                        null
                    )
                }

                onChanged={async () => {
                    await Promise.all([
                        loadData(),
                        refreshContext(),
                    ]);
                }}
            />
        );
    }


    if (
        !canManageSecurity
    ) {
        return (
            <SafeAreaView
                edges={["top"]}
                style={
                    styles.safeArea
                }
            >
                <View
                    style={
                        styles.denied
                    }
                >
                    <Ionicons
                        name="lock-closed-outline"
                        size={30}
                        color="#555555"
                    />

                    <Text
                        style={
                            styles.deniedTitle
                        }
                    >
                        Acesso indisponível
                    </Text>

                    <Text
                        style={
                            styles.deniedText
                        }
                    >
                        Você não possui permissão para administrar acessos.
                    </Text>

                    <Pressable
                        onPress={
                            onBack
                        }
                        style={
                            styles.primaryButton
                        }
                    >
                        <Text
                            style={
                                styles.primaryButtonText
                            }
                        >
                            Voltar
                        </Text>
                    </Pressable>
                </View>
            </SafeAreaView>
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
                keyboardShouldPersistTaps="handled"
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
                        Gestão da Igreja
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
                        Pessoas e acessos
                    </Text>

                    <Text
                        style={
                            styles.subtitle
                        }
                    >
                        Defina quais pessoas podem utilizar o aplicativo e o que cada uma pode administrar.
                    </Text>
                </View>


                <View
                    style={
                        styles.searchBox
                    }
                >
                    <Ionicons
                        name="search-outline"
                        size={19}
                        color="#777777"
                    />

                    <TextInput
                        value={
                            search
                        }
                        onChangeText={
                            setSearch
                        }
                        placeholder="Buscar pessoa"
                        placeholderTextColor="#999999"
                        style={
                            styles.searchInput
                        }
                    />

                    {search.length >
                        0 && (
                            <Pressable
                                onPress={() =>
                                    setSearch("")
                                }
                            >
                                <Ionicons
                                    name="close-circle"
                                    size={19}
                                    color="#999999"
                                />
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

                        <Text
                            style={
                                styles.loadingText
                            }
                        >
                            Carregando pessoas...
                        </Text>
                    </View>
                ) : (
                    <View
                        style={
                            styles.peopleList
                        }
                    >
                        {filteredPeople.map(
                            (person) => {
                                const owner =
                                    person.assignments.find(
                                        (
                                            assignment
                                        ) =>
                                            assignment.is_owner
                                    );


                                const nonOwnerAssignments =
                                    person.assignments.filter(
                                        (
                                            assignment
                                        ) =>
                                            !assignment.is_owner
                                    );


                                return (
                                    <Pressable
                                        key={
                                            person.id
                                        }
                                        onPress={() =>
                                            setSelectedPerson(
                                                person
                                            )
                                        }
                                        style={({
                                            pressed,
                                        }) => [
                                                styles.personCard,

                                                pressed &&
                                                styles.pressed,
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
                                                {getInitials(
                                                    person.full_name
                                                )}
                                            </Text>
                                        </View>


                                        <View
                                            style={
                                                styles.personInfo
                                            }
                                        >
                                            <Text
                                                style={
                                                    styles.personName
                                                }
                                            >
                                                {
                                                    person.full_name
                                                }
                                            </Text>


                                            <View
                                                style={
                                                    styles.personMetaRow
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.personMeta
                                                    }
                                                >
                                                    {MEMBERSHIP_LABELS[
                                                        person.membership_type ??
                                                        ""
                                                    ] ??
                                                        "Pessoa"}
                                                </Text>

                                                <Text
                                                    style={
                                                        styles.dot
                                                    }
                                                >
                                                    •
                                                </Text>

                                                <Text
                                                    style={
                                                        person.has_login
                                                            ? styles.loginActive
                                                            : styles.loginPending
                                                    }
                                                >
                                                    {person.has_login
                                                        ? "Login vinculado"
                                                        : "Sem login"}
                                                </Text>
                                            </View>


                                            {owner ? (
                                                <Text
                                                    style={
                                                        styles.accessSummary
                                                    }
                                                >
                                                    Proprietário • Acesso total
                                                </Text>
                                            ) : nonOwnerAssignments.length >
                                                0 ? (
                                                <Text
                                                    numberOfLines={
                                                        2
                                                    }
                                                    style={
                                                        styles.accessSummary
                                                    }
                                                >
                                                    {nonOwnerAssignments
                                                        .map(
                                                            (
                                                                assignment
                                                            ) =>
                                                                assignment.unit_name
                                                                    ? `${assignment.role_name} • ${assignment.unit_name}`
                                                                    : `${assignment.role_name} • Toda a igreja`
                                                        )
                                                        .join(
                                                            "  ·  "
                                                        )}
                                                </Text>
                                            ) : (
                                                <Text
                                                    style={
                                                        styles.noAccess
                                                    }
                                                >
                                                    Nenhum perfil atribuído
                                                </Text>
                                            )}
                                        </View>


                                        <Ionicons
                                            name="chevron-forward"
                                            size={18}
                                            color="#aaaaaa"
                                        />
                                    </Pressable>
                                );
                            }
                        )}


                        {filteredPeople.length ===
                            0 && (
                                <View
                                    style={
                                        styles.empty
                                    }
                                >
                                    <Ionicons
                                        name="people-outline"
                                        size={30}
                                        color="#888888"
                                    />

                                    <Text
                                        style={
                                            styles.emptyTitle
                                        }
                                    >
                                        Nenhuma pessoa encontrada
                                    </Text>
                                </View>
                            )}
                    </View>
                )}


                <View
                    style={
                        styles.infoBox
                    }
                >
                    <Ionicons
                        name="information-circle-outline"
                        size={19}
                        color="#555555"
                    />

                    <Text
                        style={
                            styles.infoText
                        }
                    >
                        Pessoas sem login também podem ter seus perfis configurados. O convite para entrar no aplicativo será enviado em uma etapa própria.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}


type PersonAccessEditorProps = {
    organizationId:
    string;

    person:
    PersonAccessItem;

    roles:
    AccessRole[];

    permissions:
    PermissionItem[];

    units:
    Array<{
        id: string;

        name: string;

        is_headquarters: boolean;
    }>;

    defaultUnitId:
    string | null;

    onBack:
    () => void;

    onChanged:
    () => Promise<void>;
};


function PersonAccessEditor({
    organizationId,
    person,
    roles,
    permissions,
    units,
    defaultUnitId,
    onBack,
    onChanged,
}: PersonAccessEditorProps) {
    const [
        selectedRoleId,
        setSelectedRoleId,
    ] =
        useState<string | null>(
            null
        );


    const [
        scope,
        setScope,
    ] =
        useState<
            "organization" | "unit"
        >("organization");


    const [
        selectedUnitId,
        setSelectedUnitId,
    ] =
        useState<string | null>(
            defaultUnitId
        );


    const [
        saving,
        setSaving,
    ] =
        useState(false);

    const [
        inviting,
        setInviting,
    ] =
        useState(false);


    const activeRoles =
        useMemo(
            () =>
                roles.filter(
                    (role) =>
                        role.is_active &&
                        !role.is_owner
                ),
            [
                roles,
            ]
        );


    const selectedRole =
        activeRoles.find(
            (role) =>
                role.id ===
                selectedRoleId
        ) ??
        null;


    const selectedRoleRequiresOrganization =
        useMemo(
            () => {
                if (
                    !selectedRole
                ) {
                    return false;
                }


                return selectedRole.permissions.some(
                    (
                        permissionKey
                    ) =>
                        permissions.find(
                            (
                                permission
                            ) =>
                                permission.permission_key ===
                                permissionKey
                        )
                            ?.permission_scope ===
                        "organization"
                );
            },
            [
                selectedRole,
                permissions,
            ]
        );


    useEffect(() => {
        if (
            selectedRoleRequiresOrganization
        ) {
            setScope(
                "organization"
            );
        }
    }, [
        selectedRoleRequiresOrganization,
    ]);


    async function handleGrant() {
        if (
            !selectedRoleId
        ) {
            Alert.alert(
                "Perfil de acesso",
                "Escolha um perfil."
            );

            return;
        }


        if (
            scope === "unit" &&
            !selectedUnitId
        ) {
            Alert.alert(
                "Unidade",
                "Escolha a unidade em que este acesso será válido."
            );

            return;
        }


        setSaving(
            true
        );


        try {
            const {
                error,
            } =
                await supabase.rpc(
                    "grant_person_access",
                    {
                        p_organization_id:
                            organizationId,

                        p_person_id:
                            person.id,

                        p_role_id:
                            selectedRoleId,

                        p_unit_id:
                            scope === "unit"
                                ? selectedUnitId
                                : null,
                    }
                );


            if (error) {
                throw error;
            }


            setSelectedRoleId(
                null
            );

            setScope(
                "organization"
            );


            await onChanged();
        } catch (error) {
            Alert.alert(
                "Não foi possível conceder o acesso",
                getErrorMessage(
                    error
                )
            );
        } finally {
            setSaving(
                false
            );
        }
    }

    async function handleInvite() {
        if (!person.email) {
            Alert.alert(
                "E-mail necessário",
                "Cadastre um e-mail para esta pessoa antes de enviar o convite."
            );

            return;
        }


        if (
            person.assignments.length === 0
        ) {
            Alert.alert(
                "Perfil necessário",
                "Adicione pelo menos um perfil de acesso antes de convidar esta pessoa."
            );

            return;
        }


        setInviting(
            true
        );


        try {
            const {
                data,
                error,
            } =
                await supabase.functions.invoke(
                    "invite-person",
                    {
                        body: {
                            organizationId,
                            personId:
                                person.id,
                        },
                    }
                );


            if (error) {
                throw error;
            }


            const result =
                data as {
                    status?: string;
                    message?: string;
                    email?: string;
                };


            if (
                result.status ===
                "invited"
            ) {
                Alert.alert(
                    "Convite enviado",
                    `Enviamos o convite para ${result.email ?? person.email}.`
                );
            } else if (
                result.status ===
                "linked_existing"
            ) {
                Alert.alert(
                    "Conta vinculada",
                    "Esta pessoa já possuía uma conta no Nethanel Church. O acesso a esta igreja foi vinculado."
                );
            } else if (
                result.status ===
                "already_linked"
            ) {
                Alert.alert(
                    "Acesso existente",
                    "Esta pessoa já possui uma conta vinculada ao aplicativo."
                );
            } else {
                Alert.alert(
                    "Convite",
                    result.message ??
                    "Operação concluída."
                );
            }


            await onChanged();
        } catch (error) {
            Alert.alert(
                "Não foi possível enviar o convite",
                getErrorMessage(
                    error
                )
            );
        } finally {
            setInviting(
                false
            );
        }
    }


    function handleRevoke(
        assignment:
            AccessAssignment
    ) {
        Alert.alert(
            "Remover acesso",

            `Deseja remover o perfil "${assignment.role_name}" de ${person.full_name}?`,

            [
                {
                    text:
                        "Cancelar",

                    style:
                        "cancel",
                },

                {
                    text:
                        "Remover",

                    style:
                        "destructive",

                    onPress: () => {
                        void (async () => {
                            try {
                                const {
                                    error,
                                } =
                                    await supabase.rpc(
                                        "revoke_person_access",
                                        {
                                            p_organization_id:
                                                organizationId,

                                            p_assignment_id:
                                                assignment.assignment_id,
                                        }
                                    );


                                if (error) {
                                    throw error;
                                }


                                await onChanged();
                            } catch (error) {
                                Alert.alert(
                                    "Não foi possível remover o acesso",
                                    getErrorMessage(
                                        error
                                    )
                                );
                            }
                        })();
                    },
                },
            ]
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
                    styles.editorScreen
                }
            >
                <ScrollView
                    contentContainerStyle={
                        styles.editorContent
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
                            Pessoas e acessos
                        </Text>
                    </Pressable>


                    <View
                        style={
                            styles.personHeader
                        }
                    >
                        <View
                            style={
                                styles.largeAvatar
                            }
                        >
                            <Text
                                style={
                                    styles.largeAvatarText
                                }
                            >
                                {getInitials(
                                    person.full_name
                                )}
                            </Text>
                        </View>


                        <View
                            style={
                                styles.personHeaderInfo
                            }
                        >
                            <Text
                                style={
                                    styles.editorPersonName
                                }
                            >
                                {
                                    person.full_name
                                }
                            </Text>

                            <Text
                                style={
                                    styles.editorPersonType
                                }
                            >
                                {MEMBERSHIP_LABELS[
                                    person.membership_type ??
                                    ""
                                ] ??
                                    "Pessoa"}
                            </Text>

                            <View
                                style={
                                    styles.loginStatusRow
                                }
                            >
                                <Ionicons
                                    name={
                                        person.has_login
                                            ? "checkmark-circle-outline"
                                            : "mail-outline"
                                    }
                                    size={16}
                                    color={
                                        person.has_login
                                            ? "#4f6655"
                                            : "#777777"
                                    }
                                />

                                <Text
                                    style={
                                        person.has_login
                                            ? styles.loginActive
                                            : styles.loginPending
                                    }
                                >
                                    {person.has_login
                                        ? "Login vinculado ao aplicativo"
                                        : "Ainda não possui login"}
                                </Text>
                            </View>
                        </View>
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
                            Acessos atuais
                        </Text>


                        {person.assignments.length ===
                            0 ? (
                            <View
                                style={
                                    styles.emptyAssignments
                                }
                            >
                                <Text
                                    style={
                                        styles.emptyAssignmentsText
                                    }
                                >
                                    Nenhum perfil de acesso atribuído.
                                </Text>
                            </View>
                        ) : (
                            <View
                                style={
                                    styles.assignments
                                }
                            >
                                {person.assignments.map(
                                    (
                                        assignment
                                    ) => (
                                        <View
                                            key={
                                                assignment.assignment_id
                                            }
                                            style={
                                                styles.assignmentCard
                                            }
                                        >
                                            <View
                                                style={
                                                    styles.assignmentIcon
                                                }
                                            >
                                                <Ionicons
                                                    name={
                                                        assignment.is_owner
                                                            ? "shield-checkmark"
                                                            : "key-outline"
                                                    }
                                                    size={20}
                                                    color="#444444"
                                                />
                                            </View>


                                            <View
                                                style={
                                                    styles.assignmentInfo
                                                }
                                            >
                                                <View
                                                    style={
                                                        styles.assignmentTitleRow
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.assignmentTitle
                                                        }
                                                    >
                                                        {
                                                            assignment.role_name
                                                        }
                                                    </Text>

                                                    {assignment.is_owner && (
                                                        <Text
                                                            style={
                                                                styles.protectedBadge
                                                            }
                                                        >
                                                            Protegido
                                                        </Text>
                                                    )}
                                                </View>


                                                <Text
                                                    style={
                                                        styles.assignmentScope
                                                    }
                                                >
                                                    {assignment.unit_name
                                                        ? assignment.unit_name
                                                        : "Toda a igreja"}
                                                </Text>
                                            </View>


                                            {!assignment.is_owner && (
                                                <Pressable
                                                    onPress={() =>
                                                        handleRevoke(
                                                            assignment
                                                        )
                                                    }
                                                    hitSlop={
                                                        8
                                                    }
                                                    style={
                                                        styles.removeButton
                                                    }
                                                >
                                                    <Ionicons
                                                        name="trash-outline"
                                                        size={19}
                                                        color="#8a4b4b"
                                                    />
                                                </Pressable>
                                            )}
                                        </View>
                                    )
                                )}
                            </View>
                        )}
                    </View>


                    {person.assignments.some(
                        (
                            assignment
                        ) =>
                            assignment.is_owner
                    ) ? (
                        <View
                            style={
                                styles.infoBox
                            }
                        >
                            <Ionicons
                                name="shield-checkmark-outline"
                                size={19}
                                color="#555555"
                            />

                            <Text
                                style={
                                    styles.infoText
                                }
                            >
                                O perfil Proprietário possui acesso total e é protegido pelo sistema.
                            </Text>
                        </View>
                    ) : (
                        <>
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
                                    Adicionar perfil
                                </Text>

                                <Text
                                    style={
                                        styles.sectionHint
                                    }
                                >
                                    Escolha o perfil que deseja conceder.
                                </Text>


                                <View
                                    style={
                                        styles.optionList
                                    }
                                >
                                    {activeRoles.map(
                                        (role) => {
                                            const selected =
                                                selectedRoleId ===
                                                role.id;


                                            return (
                                                <Pressable
                                                    key={
                                                        role.id
                                                    }
                                                    onPress={() =>
                                                        setSelectedRoleId(
                                                            role.id
                                                        )
                                                    }
                                                    style={[
                                                        styles.optionRow,

                                                        selected &&
                                                        styles.optionRowSelected,
                                                    ]}
                                                >
                                                    <View
                                                        style={
                                                            styles.radioOuter
                                                        }
                                                    >
                                                        {selected && (
                                                            <View
                                                                style={
                                                                    styles.radioInner
                                                                }
                                                            />
                                                        )}
                                                    </View>


                                                    <View
                                                        style={
                                                            styles.optionInfo
                                                        }
                                                    >
                                                        <Text
                                                            style={
                                                                styles.optionTitle
                                                            }
                                                        >
                                                            {
                                                                role.name
                                                            }
                                                        </Text>

                                                        {role.description ? (
                                                            <Text
                                                                numberOfLines={
                                                                    2
                                                                }
                                                                style={
                                                                    styles.optionDescription
                                                                }
                                                            >
                                                                {
                                                                    role.description
                                                                }
                                                            </Text>
                                                        ) : null}
                                                    </View>
                                                </Pressable>
                                            );
                                        }
                                    )}
                                </View>
                            </View>


                            {selectedRole && (
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
                                        Onde este acesso vale?
                                    </Text>


                                    <Pressable
                                        onPress={() =>
                                            setScope(
                                                "organization"
                                            )
                                        }
                                        style={[
                                            styles.scopeCard,

                                            scope ===
                                            "organization" &&
                                            styles.scopeCardSelected,
                                        ]}
                                    >
                                        <View
                                            style={
                                                styles.radioOuter
                                            }
                                        >
                                            {scope ===
                                                "organization" && (
                                                    <View
                                                        style={
                                                            styles.radioInner
                                                        }
                                                    />
                                                )}
                                        </View>

                                        <View
                                            style={
                                                styles.optionInfo
                                            }
                                        >
                                            <Text
                                                style={
                                                    styles.optionTitle
                                                }
                                            >
                                                Toda a igreja
                                            </Text>

                                            <Text
                                                style={
                                                    styles.optionDescription
                                                }
                                            >
                                                O perfil poderá atuar em todas as unidades da igreja.
                                            </Text>
                                        </View>
                                    </Pressable>


                                    {!selectedRoleRequiresOrganization && (
                                        <Pressable
                                            onPress={() =>
                                                setScope(
                                                    "unit"
                                                )
                                            }
                                            style={[
                                                styles.scopeCard,

                                                scope ===
                                                "unit" &&
                                                styles.scopeCardSelected,
                                            ]}
                                        >
                                            <View
                                                style={
                                                    styles.radioOuter
                                                }
                                            >
                                                {scope ===
                                                    "unit" && (
                                                        <View
                                                            style={
                                                                styles.radioInner
                                                            }
                                                        />
                                                    )}
                                            </View>

                                            <View
                                                style={
                                                    styles.optionInfo
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.optionTitle
                                                    }
                                                >
                                                    Somente uma unidade
                                                </Text>

                                                <Text
                                                    style={
                                                        styles.optionDescription
                                                    }
                                                >
                                                    O perfil valerá apenas na congregação escolhida.
                                                </Text>
                                            </View>
                                        </Pressable>
                                    )}


                                    {selectedRoleRequiresOrganization && (
                                        <View
                                            style={
                                                styles.scopeNotice
                                            }
                                        >
                                            <Ionicons
                                                name="information-circle-outline"
                                                size={18}
                                                color="#555555"
                                            />

                                            <Text
                                                style={
                                                    styles.scopeNoticeText
                                                }
                                            >
                                                Este perfil possui permissões administrativas da igreja e precisa valer para toda a organização.
                                            </Text>
                                        </View>
                                    )}


                                    {scope ===
                                        "unit" &&
                                        !selectedRoleRequiresOrganization && (
                                            <View
                                                style={
                                                    styles.unitsBlock
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.unitLabel
                                                    }
                                                >
                                                    Unidade
                                                </Text>

                                                <View
                                                    style={
                                                        styles.optionList
                                                    }
                                                >
                                                    {units.map(
                                                        (
                                                            unit
                                                        ) => {
                                                            const selected =
                                                                selectedUnitId ===
                                                                unit.id;


                                                            return (
                                                                <Pressable
                                                                    key={
                                                                        unit.id
                                                                    }
                                                                    onPress={() =>
                                                                        setSelectedUnitId(
                                                                            unit.id
                                                                        )
                                                                    }
                                                                    style={[
                                                                        styles.optionRow,

                                                                        selected &&
                                                                        styles.optionRowSelected,
                                                                    ]}
                                                                >
                                                                    <View
                                                                        style={
                                                                            styles.radioOuter
                                                                        }
                                                                    >
                                                                        {selected && (
                                                                            <View
                                                                                style={
                                                                                    styles.radioInner
                                                                                }
                                                                            />
                                                                        )}
                                                                    </View>

                                                                    <Text
                                                                        style={
                                                                            styles.optionTitle
                                                                        }
                                                                    >
                                                                        {
                                                                            unit.name
                                                                        }

                                                                        {unit.is_headquarters
                                                                            ? " • Sede"
                                                                            : ""}
                                                                    </Text>
                                                                </Pressable>
                                                            );
                                                        }
                                                    )}
                                                </View>
                                            </View>
                                        )}
                                </View>
                            )}


                            {!person.has_login && (
                                <View
                                    style={
                                        styles.inviteNotice
                                    }
                                >
                                    <Ionicons
                                        name="mail-outline"
                                        size={19}
                                        color="#555555"
                                    />

                                    <View
                                        style={
                                            styles.inviteNoticeContent
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.inviteNoticeTitle
                                            }
                                        >
                                            Acesso ainda não enviado
                                        </Text>

                                        <Text
                                            style={
                                                styles.inviteNoticeText
                                            }
                                        >
                                            Você pode configurar os perfis agora. Depois adicionaremos o convite seguro para a pessoa criar seu login.
                                        </Text>
                                    </View>

                                    <Pressable
                                        disabled={
                                            inviting ||
                                            !person.email ||
                                            person.assignments.length === 0
                                        }
                                        onPress={() =>
                                            void handleInvite()
                                        }
                                        style={[
                                            styles.inviteButton,

                                            (
                                                inviting ||
                                                !person.email ||
                                                person.assignments.length === 0
                                            ) &&
                                            styles.buttonDisabled,
                                        ]}
                                    >
                                        {inviting ? (
                                            <ActivityIndicator
                                                color="#ffffff"
                                            />
                                        ) : (
                                            <>
                                                <Ionicons
                                                    name="mail-outline"
                                                    size={18}
                                                    color="#ffffff"
                                                />

                                                <Text
                                                    style={
                                                        styles.inviteButtonText
                                                    }
                                                >
                                                    Convidar para o aplicativo
                                                </Text>
                                            </>
                                        )}
                                    </Pressable>
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>


                {!person.assignments.some(
                    (
                        assignment
                    ) =>
                        assignment.is_owner
                ) &&
                    selectedRole && (
                        <View
                            style={
                                styles.footer
                            }
                        >
                            <Pressable
                                disabled={
                                    saving
                                }
                                onPress={() =>
                                    void handleGrant()
                                }
                                style={[
                                    styles.primaryButton,

                                    saving &&
                                    styles.buttonDisabled,
                                ]}
                            >
                                {saving ? (
                                    <ActivityIndicator
                                        color="#ffffff"
                                    />
                                ) : (
                                    <>
                                        <Ionicons
                                            name="add"
                                            size={20}
                                            color="#ffffff"
                                        />

                                        <Text
                                            style={
                                                styles.primaryButtonText
                                            }
                                        >
                                            Adicionar acesso
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    )}
            </View>
        </SafeAreaView>
    );
}


const styles =
    StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: "#f7f7f6",
        },

        content: {
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 40,
        },

        editorScreen: {
            flex: 1,
        },

        editorContent: {
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 120,
        },

        back: {
            minHeight: 42,
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
        },

        backText: {
            fontSize: 14,
            fontWeight: "600",
            color: "#333333",
        },

        heading: {
            paddingTop: 18,
            paddingBottom: 22,
        },

        title: {
            fontSize: 28,
            fontWeight: "700",
            color: "#111111",
        },

        subtitle: {
            marginTop: 8,
            maxWidth: 440,
            fontSize: 14,
            lineHeight: 21,
            color: "#727272",
        },

        searchBox: {
            minHeight: 50,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            paddingHorizontal: 14,
            marginBottom: 18,
            borderWidth: 1,
            borderColor: "#dededb",
            borderRadius: 13,
            backgroundColor: "#ffffff",
        },

        searchInput: {
            flex: 1,
            fontSize: 14,
            color: "#222222",
        },

        loading: {
            paddingVertical: 45,
            alignItems: "center",
            gap: 12,
        },

        loadingText: {
            fontSize: 13,
            color: "#777777",
        },

        peopleList: {
            gap: 9,
        },

        personCard: {
            minHeight: 86,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 13,
            borderWidth: 1,
            borderColor: "#e0e0dd",
            borderRadius: 14,
            backgroundColor: "#ffffff",
        },

        pressed: {
            opacity: 0.74,
        },

        avatar: {
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 22,
            backgroundColor: "#ededeb",
        },

        avatarText: {
            fontSize: 14,
            fontWeight: "700",
            color: "#444444",
        },

        personInfo: {
            flex: 1,
        },

        personName: {
            fontSize: 15,
            fontWeight: "700",
            color: "#202020",
        },

        personMetaRow: {
            marginTop: 4,
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 5,
        },

        personMeta: {
            fontSize: 11,
            color: "#777777",
        },

        dot: {
            fontSize: 11,
            color: "#aaaaaa",
        },

        loginActive: {
            fontSize: 11,
            fontWeight: "600",
            color: "#526c59",
        },

        loginPending: {
            fontSize: 11,
            fontWeight: "600",
            color: "#777777",
        },

        accessSummary: {
            marginTop: 5,
            fontSize: 11,
            lineHeight: 16,
            fontWeight: "600",
            color: "#555555",
        },

        noAccess: {
            marginTop: 5,
            fontSize: 11,
            color: "#999999",
        },

        empty: {
            paddingVertical: 42,
            alignItems: "center",
            gap: 9,
        },

        emptyTitle: {
            fontSize: 14,
            fontWeight: "600",
            color: "#666666",
        },

        infoBox: {
            marginTop: 20,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 9,
            padding: 13,
            borderRadius: 12,
            backgroundColor: "#eeeeeb",
        },

        infoText: {
            flex: 1,
            fontSize: 12,
            lineHeight: 18,
            color: "#5f5f5f",
        },

        personHeader: {
            marginTop: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            paddingBottom: 24,
            borderBottomWidth: 1,
            borderBottomColor: "#e2e2df",
        },

        largeAvatar: {
            width: 58,
            height: 58,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 29,
            backgroundColor: "#e9e9e6",
        },

        largeAvatarText: {
            fontSize: 17,
            fontWeight: "700",
            color: "#3f3f3f",
        },

        personHeaderInfo: {
            flex: 1,
        },

        editorPersonName: {
            fontSize: 19,
            fontWeight: "700",
            color: "#171717",
        },

        editorPersonType: {
            marginTop: 3,
            fontSize: 12,
            color: "#707070",
        },

        loginStatusRow: {
            marginTop: 7,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
        },

        section: {
            marginTop: 25,
        },

        sectionTitle: {
            fontSize: 16,
            fontWeight: "700",
            color: "#222222",
        },

        sectionHint: {
            marginTop: 5,
            marginBottom: 11,
            fontSize: 12,
            color: "#777777",
        },

        emptyAssignments: {
            marginTop: 11,
            padding: 14,
            borderRadius: 12,
            backgroundColor: "#eeeeeb",
        },

        emptyAssignmentsText: {
            fontSize: 12,
            color: "#666666",
        },

        assignments: {
            marginTop: 11,
            gap: 8,
        },

        assignmentCard: {
            minHeight: 69,
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            padding: 12,
            borderWidth: 1,
            borderColor: "#e0e0dd",
            borderRadius: 13,
            backgroundColor: "#ffffff",
        },

        assignmentIcon: {
            width: 38,
            height: 38,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            backgroundColor: "#efefec",
        },

        assignmentInfo: {
            flex: 1,
        },

        assignmentTitleRow: {
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 7,
        },

        assignmentTitle: {
            fontSize: 14,
            fontWeight: "700",
            color: "#262626",
        },

        assignmentScope: {
            marginTop: 4,
            fontSize: 11,
            color: "#737373",
        },

        protectedBadge: {
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: 8,
            backgroundColor: "#e9e9e6",
            fontSize: 10,
            fontWeight: "700",
            color: "#585858",
        },

        removeButton: {
            width: 38,
            height: 38,
            alignItems: "center",
            justifyContent: "center",
        },

        optionList: {
            marginTop: 10,
            gap: 8,
        },

        optionRow: {
            minHeight: 58,
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            paddingHorizontal: 13,
            paddingVertical: 11,
            borderWidth: 1,
            borderColor: "#e0e0dd",
            borderRadius: 12,
            backgroundColor: "#ffffff",
        },

        optionRowSelected: {
            borderColor: "#777777",
            backgroundColor: "#f1f1ee",
        },

        radioOuter: {
            width: 20,
            height: 20,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: "#777777",
            borderRadius: 10,
        },

        radioInner: {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: "#292929",
        },

        optionInfo: {
            flex: 1,
        },

        optionTitle: {
            fontSize: 13,
            fontWeight: "700",
            color: "#2e2e2e",
        },

        optionDescription: {
            marginTop: 3,
            fontSize: 11,
            lineHeight: 16,
            color: "#777777",
        },

        scopeCard: {
            marginTop: 10,
            minHeight: 67,
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            padding: 13,
            borderWidth: 1,
            borderColor: "#e0e0dd",
            borderRadius: 12,
            backgroundColor: "#ffffff",
        },

        scopeCardSelected: {
            borderColor: "#777777",
            backgroundColor: "#f1f1ee",
        },

        scopeNotice: {
            marginTop: 10,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            padding: 12,
            borderRadius: 11,
            backgroundColor: "#eeeeeb",
        },

        scopeNoticeText: {
            flex: 1,
            fontSize: 11,
            lineHeight: 17,
            color: "#616161",
        },

        unitsBlock: {
            marginTop: 18,
        },

        unitLabel: {
            fontSize: 13,
            fontWeight: "700",
            color: "#333333",
        },

        inviteNotice: {
            marginTop: 24,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            padding: 13,
            borderRadius: 12,
            backgroundColor: "#eeeeeb",
        },

        inviteNoticeContent: {
            flex: 1,
        },

        inviteNoticeTitle: {
            fontSize: 12,
            fontWeight: "700",
            color: "#444444",
        },

        inviteNoticeText: {
            marginTop: 4,
            fontSize: 11,
            lineHeight: 17,
            color: "#666666",
        },

        footer: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: "#e2e2df",
            backgroundColor: "#ffffff",
        },

        primaryButton: {
            minHeight: 50,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingHorizontal: 18,
            borderRadius: 12,
            backgroundColor: "#202020",
        },

        primaryButtonText: {
            fontSize: 14,
            fontWeight: "700",
            color: "#ffffff",
        },

        buttonDisabled: {
            opacity: 0.55,
        },

        denied: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 30,
        },

        deniedTitle: {
            marginTop: 13,
            fontSize: 18,
            fontWeight: "700",
            color: "#222222",
        },

        deniedText: {
            marginTop: 7,
            marginBottom: 22,
            maxWidth: 330,
            textAlign: "center",
            fontSize: 13,
            lineHeight: 19,
            color: "#777777",
        },

        inviteButton: {
            minHeight: 46,
            marginTop: 13,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 11,
            backgroundColor: "#202020",
        },

        inviteButtonText: {
            fontSize: 13,
            fontWeight: "700",
            color: "#ffffff",
        },
    });