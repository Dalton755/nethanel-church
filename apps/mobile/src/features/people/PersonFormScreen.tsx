import {
    useState,
} from "react";

import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
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

import DateTimePicker, {
    type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

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
    MEMBERSHIP_LABELS,
    type MembershipType,
    type PersonListItem,
} from "./people.types";


type PersonFormScreenProps = {
    person?: PersonListItem | null;

    onCancel: () => void;

    onSaved: () => Promise<void>;
};


const MEMBERSHIP_OPTIONS:
    MembershipType[] = [
        "member",
        "congregant",
        "visitor",
        "minister",
        "staff",
        "other",
    ];


function digitsOnly(
    value: string
) {
    return value.replace(
        /\D/g,
        ""
    );
}


function formatPhone(
    value: string
) {
    const digits =
        digitsOnly(value)
            .slice(
                0,
                11
            );

    if (
        digits.length <=
        2
    ) {
        return digits.length
            ? `(${digits}`
            : "";
    }

    if (
        digits.length <=
        6
    ) {
        return `(${digits.slice(
            0,
            2
        )}) ${digits.slice(
            2
        )}`;
    }

    if (
        digits.length <=
        10
    ) {
        return `(${digits.slice(
            0,
            2
        )}) ${digits.slice(
            2,
            6
        )}-${digits.slice(
            6
        )}`;
    }

    return `(${digits.slice(
        0,
        2
    )}) ${digits.slice(
        2,
        7
    )}-${digits.slice(
        7
    )}`;
}


function parseDatabaseDate(
    value:
        string | null
) {
    if (!value) {
        return null;
    }

    const [
        year,
        month,
        day,
    ] =
        value
            .split("-")
            .map(Number);

    return new Date(
        year,
        month - 1,
        day
    );
}


function databaseDate(
    value:
        Date | null
) {
    if (!value) {
        return null;
    }

    const year =
        value.getFullYear();

    const month =
        String(
            value.getMonth() +
                1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            value.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${year}-${month}-${day}`;
}


function displayDate(
    value:
        Date | null
) {
    if (!value) {
        return "Selecionar data";
    }

    return new Intl.DateTimeFormat(
        "pt-BR"
    ).format(
        value
    );
}


export function PersonFormScreen({
    person = null,
    onCancel,
    onSaved,
}: PersonFormScreenProps) {
    const {
        activeOrganization,
        activeUnit,
        permissions,
    } =
        useOrganization();


    const isEditing =
        person !== null;


    const [
        fullName,
        setFullName,
    ] =
        useState(
            person?.full_name ??
                ""
        );


    const [
        preferredName,
        setPreferredName,
    ] =
        useState(
            person
                ?.preferred_name ??
                ""
        );


    const [
        membershipType,
        setMembershipType,
    ] =
        useState<MembershipType>(
            person
                ?.membership_type ??
                "member"
        );


    const [
        phone,
        setPhone,
    ] =
        useState(
            person?.phone ??
                ""
        );


    const [
        email,
        setEmail,
    ] =
        useState(
            person?.email ??
                ""
        );


    const [
        birthDate,
        setBirthDate,
    ] =
        useState<Date | null>(
            parseDatabaseDate(
                person?.birth_date ??
                    null
            )
        );


    const [
        showDatePicker,
        setShowDatePicker,
    ] =
        useState(false);


    const [
        loading,
        setLoading,
    ] =
        useState(false);


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
            "people.manage"
        );


    function handleDateChange(
        event:
            DateTimePickerEvent,

        selectedDate?: Date
    ) {
        if (
            Platform.OS ===
            "android"
        ) {
            setShowDatePicker(
                false
            );
        }

        if (
            event.type ===
            "dismissed"
        ) {
            return;
        }

        if (selectedDate) {
            setBirthDate(
                selectedDate
            );
        }
    }


    async function handleSave() {
        setErrorMessage(
            null
        );


        if (
            !activeOrganization ||
            !activeUnit
        ) {
            setErrorMessage(
                "Organização ou unidade ativa não encontrada."
            );

            return;
        }


        if (!canManage) {
            setErrorMessage(
                "Seu perfil não possui permissão para gerenciar pessoas."
            );

            return;
        }


        if (
            fullName
                .trim()
                .length <
            2
        ) {
            setErrorMessage(
                "Informe o nome completo."
            );

            return;
        }


        if (
            email.trim() &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                email.trim()
            )
        ) {
            setErrorMessage(
                "Informe um e-mail válido."
            );

            return;
        }


        if (
            birthDate &&
            birthDate.getTime() >
                Date.now()
        ) {
            setErrorMessage(
                "A data de nascimento não pode estar no futuro."
            );

            return;
        }


        setLoading(
            true
        );


        try {
            const params = {
                p_organization_id:
                    activeOrganization.id,

                p_unit_id:
                    activeUnit.id,

                p_full_name:
                    fullName.trim(),

                p_preferred_name:
                    preferredName
                        .trim() ||
                    null,

                p_email:
                    email.trim() ||
                    null,

                p_phone:
                    phone.trim() ||
                    null,

                p_birth_date:
                    databaseDate(
                        birthDate
                    ),

                p_membership_type:
                    membershipType,
            };


            if (isEditing) {
                const {
                    error,
                } =
                    await supabase.rpc(
                        "update_person",
                        {
                            p_person_id:
                                person.id,

                            ...params,
                        }
                    );

                if (error) {
                    throw error;
                }
            } else {
                const {
                    error,
                } =
                    await supabase.rpc(
                        "create_person",
                        params
                    );

                if (error) {
                    throw error;
                }
            }


            await onSaved();
        } catch (error) {
            const message =
                error instanceof
                Error
                    ? error.message
                    : "Não foi possível salvar a pessoa.";

            setErrorMessage(
                message
            );
        } finally {
            setLoading(
                false
            );
        }
    }


    return (
        <SafeAreaView
            edges={["top"]}
            style={
                styles.safeArea
            }
        >
            <KeyboardAvoidingView
                style={
                    styles.flex
                }
                behavior={
                    Platform.OS ===
                    "ios"
                        ? "padding"
                        : "height"
                }
            >
                <ScrollView
                    contentContainerStyle={
                        styles.content
                    }
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={
                        Platform.OS ===
                        "ios"
                            ? "interactive"
                            : "on-drag"
                    }
                    showsVerticalScrollIndicator={
                        false
                    }
                >
                    <Pressable
                        onPress={
                            onCancel
                        }
                        disabled={
                            loading
                        }
                    >
                        <Text
                            style={
                                styles.cancel
                            }
                        >
                            Cancelar
                        </Text>
                    </Pressable>


                    <Text
                        style={
                            styles.title
                        }
                    >
                        {isEditing
                            ? "Editar pessoa"
                            : "Nova pessoa"}
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


                    <View
                        style={
                            styles.form
                        }
                    >
                        <Field
                            label="Nome completo"
                            value={
                                fullName
                            }
                            onChangeText={
                                setFullName
                            }
                            placeholder="Ex.: Maria Oliveira"
                        />


                        <Field
                            label="Como prefere ser chamada?"
                            value={
                                preferredName
                            }
                            onChangeText={
                                setPreferredName
                            }
                            placeholder="Ex.: Maria"
                        />


                        <View
                            style={
                                styles.field
                            }
                        >
                            <Text
                                style={
                                    styles.label
                                }
                            >
                                Vínculo com a igreja
                            </Text>

                            <Text
                                style={
                                    styles.helper
                                }
                            >
                                Selecione como esta pessoa participa da igreja.
                            </Text>

                            <View
                                style={
                                    styles.options
                                }
                            >
                                {MEMBERSHIP_OPTIONS.map(
                                    (
                                        option
                                    ) => (
                                        <Pressable
                                            key={
                                                option
                                            }
                                            onPress={() =>
                                                setMembershipType(
                                                    option
                                                )
                                            }
                                            style={[
                                                styles.option,

                                                membershipType ===
                                                    option &&
                                                    styles.optionSelected,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionText,

                                                    membershipType ===
                                                        option &&
                                                        styles.optionTextSelected,
                                                ]}
                                            >
                                                {
                                                    MEMBERSHIP_LABELS[
                                                        option
                                                    ]
                                                }
                                            </Text>
                                        </Pressable>
                                    )
                                )}
                            </View>
                        </View>


                        <Field
                            label="Telefone"
                            value={
                                phone
                            }
                            onChangeText={(
                                value
                            ) =>
                                setPhone(
                                    formatPhone(
                                        value
                                    )
                                )
                            }
                            placeholder="(11) 99999-9999"
                            keyboardType="phone-pad"
                        />


                        <Field
                            label="E-mail"
                            value={
                                email
                            }
                            onChangeText={
                                setEmail
                            }
                            placeholder="nome@email.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />


                        <View
                            style={
                                styles.field
                            }
                        >
                            <Text
                                style={
                                    styles.label
                                }
                            >
                                Data de nascimento
                            </Text>

                            <Pressable
                                onPress={() =>
                                    setShowDatePicker(
                                        true
                                    )
                                }
                                style={
                                    styles.dateSelector
                                }
                            >
                                <Ionicons
                                    name="calendar-outline"
                                    size={
                                        19
                                    }
                                    color="#666666"
                                />

                                <Text
                                    style={[
                                        styles.dateText,

                                        !birthDate &&
                                            styles.datePlaceholder,
                                    ]}
                                >
                                    {displayDate(
                                        birthDate
                                    )}
                                </Text>

                                <Ionicons
                                    name="chevron-forward"
                                    size={
                                        17
                                    }
                                    color="#999999"
                                />
                            </Pressable>


                            {birthDate && (
                                <Pressable
                                    onPress={() =>
                                        setBirthDate(
                                            null
                                        )
                                    }
                                >
                                    <Text
                                        style={
                                            styles.clearDate
                                        }
                                    >
                                        Remover data
                                    </Text>
                                </Pressable>
                            )}
                        </View>


                        {showDatePicker && (
                            <DateTimePicker
                                value={
                                    birthDate ??
                                    new Date(
                                        1990,
                                        0,
                                        1
                                    )
                                }
                                mode="date"
                                maximumDate={
                                    new Date()
                                }
                                display={
                                    Platform.OS ===
                                    "ios"
                                        ? "spinner"
                                        : "default"
                                }
                                onChange={
                                    handleDateChange
                                }
                            />
                        )}


                        {errorMessage && (
                            <View
                                style={
                                    styles.errorBox
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
                            </View>
                        )}


                        <Pressable
                            onPress={
                                handleSave
                            }
                            disabled={
                                loading
                            }
                            style={({
                                pressed,
                            }) => [
                                styles.saveButton,

                                pressed &&
                                    !loading &&
                                    styles.pressed,

                                loading &&
                                    styles.disabled,
                            ]}
                        >
                            {loading ? (
                                <ActivityIndicator
                                    color="#ffffff"
                                />
                            ) : (
                                <Text
                                    style={
                                        styles.saveButtonText
                                    }
                                >
                                    {isEditing
                                        ? "Salvar alterações"
                                        : "Salvar pessoa"}
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}


type FieldProps = {
    label: string;

    value: string;

    placeholder?: string;

    keyboardType?:
        | "default"
        | "phone-pad"
        | "email-address";

    autoCapitalize?:
        | "none"
        | "sentences";

    onChangeText: (
        value: string
    ) => void;
};


function Field({
    label,
    value,
    placeholder,
    keyboardType = "default",
    autoCapitalize = "sentences",
    onChangeText,
}: FieldProps) {
    return (
        <View
            style={
                styles.field
            }
        >
            <Text
                style={
                    styles.label
                }
            >
                {label}
            </Text>

            <TextInput
                value={
                    value
                }
                onChangeText={
                    onChangeText
                }
                placeholder={
                    placeholder
                }
                placeholderTextColor="#999999"
                keyboardType={
                    keyboardType
                }
                autoCapitalize={
                    autoCapitalize
                }
                style={
                    styles.input
                }
            />
        </View>
    );
}


const styles =
    StyleSheet.create({
        flex: {
            flex: 1,
        },

        safeArea: {
            flex: 1,
            backgroundColor:
                "#f7f7f6",
        },

        content: {
            flexGrow: 1,
            paddingHorizontal:
                20,
            paddingTop:
                18,
            paddingBottom:
                160,
        },

        cancel: {
            marginBottom:
                24,
            fontSize:
                14,
            fontWeight:
                "600",
            color:
                "#666666",
        },

        title: {
            fontSize:
                29,
            fontWeight:
                "700",
            color:
                "#111111",
        },

        subtitle: {
            marginTop:
                6,
            marginBottom:
                30,
            fontSize:
                14,
            color:
                "#717171",
        },

        form: {
            gap:
                19,
        },

        field: {
            gap:
                7,
        },

        label: {
            fontSize:
                14,
            fontWeight:
                "600",
            color:
                "#292929",
        },

        helper: {
            marginTop:
                -2,
            fontSize:
                12,
            lineHeight:
                17,
            color:
                "#777777",
        },

        input: {
            height:
                50,
            paddingHorizontal:
                14,
            borderWidth:
                1,
            borderColor:
                "#ddddda",
            borderRadius:
                12,
            backgroundColor:
                "#ffffff",
            fontSize:
                16,
            color:
                "#111111",
        },

        options: {
            flexDirection:
                "row",
            flexWrap:
                "wrap",
            gap:
                8,
            marginTop:
                3,
        },

        option: {
            minHeight:
                38,
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
                20,
            backgroundColor:
                "#ffffff",
        },

        optionSelected: {
            borderColor:
                "#171717",
            backgroundColor:
                "#171717",
        },

        optionText: {
            fontSize:
                13,
            fontWeight:
                "600",
            color:
                "#555555",
        },

        optionTextSelected: {
            color:
                "#ffffff",
        },

        dateSelector: {
            minHeight:
                50,
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

        dateText: {
            flex: 1,
            fontSize:
                15,
            color:
                "#202020",
        },

        datePlaceholder: {
            color:
                "#999999",
        },

        clearDate: {
            marginTop:
                2,
            fontSize:
                12,
            fontWeight:
                "600",
            color:
                "#777777",
        },

        errorBox: {
            padding:
                12,
            borderRadius:
                10,
            backgroundColor:
                "#fff1f1",
        },

        errorText: {
            fontSize:
                14,
            lineHeight:
                20,
            color:
                "#8b1e1e",
        },

        saveButton: {
            minHeight:
                52,
            marginTop:
                8,
            borderRadius:
                12,
            backgroundColor:
                "#171717",
            alignItems:
                "center",
            justifyContent:
                "center",
        },

        saveButtonText: {
            fontSize:
                16,
            fontWeight:
                "700",
            color:
                "#ffffff",
        },

        pressed: {
            opacity:
                0.8,
        },

        disabled: {
            opacity:
                0.55,
        },
    });