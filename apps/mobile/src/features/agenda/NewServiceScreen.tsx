import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import * as ImagePicker from "expo-image-picker";

import { File } from "expo-file-system";

type NewServiceScreenProps = {
    onCancel: () => void;
    onCreated: () => Promise<void>;
};

function pad(value: number) {
    return value.toString().padStart(2, "0");
}

function formatDate(date: Date) {
    return `${pad(date.getDate())}/${pad(
        date.getMonth() + 1
    )}/${date.getFullYear()}`;
}

function parseDateTime(
    dateValue: string,
    timeValue: string
) {
    const dateMatch = dateValue
        .trim()
        .match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
        );

    const timeMatch = timeValue
        .trim()
        .match(/^(\d{2}):(\d{2})$/);

    if (!dateMatch || !timeMatch) {
        return null;
    }

    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);

    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);

    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    const date = new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        0,
        0
    );

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

export function NewServiceScreen({
    onCancel,
    onCreated,
}: NewServiceScreenProps) {
    const {
        activeOrganization,
        activeUnit,
        permissions,
    } = useOrganization();

    const today = useMemo(
        () => formatDate(new Date()),
        []
    );

    const [title, setTitle] =
        useState("Culto");

    const [date, setDate] =
        useState(today);

    const [startTime, setStartTime] =
        useState("19:30");

    const [endTime, setEndTime] =
        useState("21:00");

    const [locationName, setLocationName] =
        useState("");

    const [theme, setTheme] =
        useState("");

    const [preacherName, setPreacherName] =
        useState("");

    const [
        bibleReference,
        setBibleReference,
    ] = useState("");

    const [
        selectedImage,
        setSelectedImage,
    ] =
        useState<ImagePicker.ImagePickerAsset | null>(
            null
        );

    const [loading, setLoading] =
        useState(false);

    const [
        errorMessage,
        setErrorMessage,
    ] = useState<string | null>(null);

    const canCreate =
        permissions.includes(
            "agenda.manage"
        ) &&
        permissions.includes(
            "services.manage"
        );

    async function handlePickImage() {
        const permission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setErrorMessage(
                "Permita o acesso às fotos para escolher uma imagem."
            );
            return;
        }

        const result =
            await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: false,
                quality: 0.85,
            });

        if (!result.canceled) {
            setSelectedImage(
                result.assets[0]
            );
        }
    }

    async function handleSave() {
        setErrorMessage(null);

        if (
            !activeOrganization ||
            !activeUnit
        ) {
            setErrorMessage(
                "Organização ou unidade ativa não encontrada."
            );
            return;
        }

        if (!canCreate) {
            setErrorMessage(
                "Seu perfil não possui permissão para criar cultos."
            );
            return;
        }

        if (title.trim().length < 2) {
            setErrorMessage(
                "Informe o nome do culto."
            );
            return;
        }

        const startsAt = parseDateTime(
            date,
            startTime
        );

        if (!startsAt) {
            setErrorMessage(
                "Informe uma data e horário inicial válidos."
            );
            return;
        }

        let endsAt: Date | null = null;

        if (endTime.trim()) {
            endsAt = parseDateTime(
                date,
                endTime
            );

            if (!endsAt) {
                setErrorMessage(
                    "Informe um horário final válido."
                );
                return;
            }

            if (
                endsAt.getTime() <
                startsAt.getTime()
            ) {
                setErrorMessage(
                    "O término não pode ser anterior ao início."
                );
                return;
            }
        }

        setLoading(true);

        try {
            const { data, error } =
                await supabase.rpc(
                    "create_service_event",
                    {
                        p_organization_id:
                            activeOrganization.id,

                        p_unit_id:
                            activeUnit.id,

                        p_title:
                            title.trim(),

                        p_starts_at:
                            startsAt.toISOString(),

                        p_ends_at:
                            endsAt?.toISOString() ??
                            null,

                        p_location_name:
                            locationName.trim() ||
                            activeUnit.name,

                        p_visibility:
                            "members",

                        p_theme:
                            theme.trim() || null,

                        p_preacher_name:
                            preacherName.trim() ||
                            null,

                        p_bible_reference:
                            bibleReference.trim() ||
                            null,

                        p_livestream_url:
                            null,

                        p_notes:
                            null,
                    }
                );

            if (error) {
                throw error;
            }

            const created =
                data as {
                    event_id?: string;
                } | null;

            const eventId =
                created?.event_id;

            if (
                selectedImage &&
                eventId
            ) {
                const imageFile = new File(
                    selectedImage.uri
                );

                const fileData =
                    await imageFile.arrayBuffer();

                if (fileData.byteLength < 1024) {
                    throw new Error(
                        `A imagem selecionada não pôde ser lida corretamente (${fileData.byteLength} bytes).`
                    );
                }

                const mimeType =
                    selectedImage.mimeType ??
                    "image/jpeg";

                let extension = "jpg";

                if (mimeType === "image/png") {
                    extension = "png";
                }

                if (mimeType === "image/webp") {
                    extension = "webp";
                }

                const imagePath =
                    `${activeOrganization.id}/` +
                    `${activeUnit.id}/` +
                    `${eventId}/cover.${extension}`;

                const {
                    error: uploadError,
                } = await supabase.storage
                    .from("event-covers")
                    .upload(
                        imagePath,
                        fileData,
                        {
                            contentType: mimeType,
                            upsert: true,
                        }
                    );

                if (uploadError) {
                    throw uploadError;
                }

                const {
                    data: signedImage,
                    error: signedImageError,
                } = await supabase.storage
                    .from("event-covers")
                    .createSignedUrl(
                        imagePath,
                        60
                    );

                if (
                    signedImageError ||
                    !signedImage?.signedUrl
                ) {
                    throw new Error(
                        "A imagem foi enviada, mas não pôde ser lida novamente."
                    );
                }

                const {
                    error: updateImageError,
                } = await supabase
                    .from("events")
                    .update({
                        cover_image_path:
                            imagePath,
                    })
                    .eq("id", eventId)
                    .eq(
                        "organization_id",
                        activeOrganization.id
                    );

                if (updateImageError) {
                    await supabase.storage
                        .from("event-covers")
                        .remove([imagePath]);

                    throw updateImageError;
                }
            }

            await onCreated();
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Não foi possível salvar o culto.";

            setErrorMessage(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <SafeAreaView
            edges={["top"]}
            style={styles.safeArea}
        >
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={
                    Platform.OS === "ios"
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
                        Platform.OS === "ios"
                            ? "interactive"
                            : "on-drag"
                    }
                    showsVerticalScrollIndicator={
                        false
                    }
                >
                    <View style={styles.header}>
                        <Pressable
                            onPress={onCancel}
                            disabled={loading}
                        >
                            <Text style={styles.cancel}>
                                Cancelar
                            </Text>
                        </Pressable>

                        <Text style={styles.title}>
                            Novo culto
                        </Text>

                        <Text style={styles.subtitle}>
                            {activeUnit?.name}
                        </Text>
                    </View>

                    <View style={styles.form}>
                        <View style={styles.field}>
                            <Text style={styles.label}>
                                Imagem de capa
                            </Text>

                            <Pressable
                                onPress={handlePickImage}
                                style={styles.imagePicker}
                            >
                                {selectedImage ? (
                                    <Image
                                        source={{
                                            uri: selectedImage.uri,
                                        }}
                                        style={styles.imagePreview}
                                    />
                                ) : (
                                    <View
                                        style={
                                            styles.imagePlaceholder
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.imagePlaceholderTitle
                                            }
                                        >
                                            Adicionar imagem
                                        </Text>

                                        <Text
                                            style={
                                                styles.imagePlaceholderText
                                            }
                                        >
                                            Toque para escolher uma foto
                                        </Text>
                                    </View>
                                )}
                            </Pressable>

                            {selectedImage && (
                                <Pressable
                                    onPress={handlePickImage}
                                >
                                    <Text style={styles.changeImage}>
                                        Trocar imagem
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                        <Field
                            label="Nome do culto"
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Ex.: Culto de Ensino"
                        />

                        <Field
                            label="Data"
                            value={date}
                            onChangeText={setDate}
                            placeholder="dd/mm/aaaa"
                            keyboardType="numeric"
                        />

                        <View style={styles.row}>
                            <View style={styles.flex}>
                                <Field
                                    label="Início"
                                    value={startTime}
                                    onChangeText={
                                        setStartTime
                                    }
                                    placeholder="19:30"
                                    keyboardType="numeric"
                                />
                            </View>

                            <View style={styles.flex}>
                                <Field
                                    label="Término"
                                    value={endTime}
                                    onChangeText={
                                        setEndTime
                                    }
                                    placeholder="21:00"
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

                        <Field
                            label="Local"
                            value={locationName}
                            onChangeText={
                                setLocationName
                            }
                            placeholder={
                                activeUnit?.name ??
                                "Local do culto"
                            }
                        />

                        <View style={styles.divider} />

                        <Text
                            style={styles.sectionTitle}
                        >
                            Informações do culto
                        </Text>

                        <Text
                            style={
                                styles.sectionDescription
                            }
                        >
                            Estes campos são opcionais e
                            podem ser preenchidos depois.
                        </Text>

                        <Field
                            label="Tema"
                            value={theme}
                            onChangeText={setTheme}
                            placeholder="Tema da mensagem"
                        />

                        <Field
                            label="Pregador"
                            value={preacherName}
                            onChangeText={
                                setPreacherName
                            }
                            placeholder="Nome do pregador"
                        />

                        <Field
                            label="Referência bíblica"
                            value={bibleReference}
                            onChangeText={
                                setBibleReference
                            }
                            placeholder="Ex.: João 3:16"
                        />

                        {errorMessage && (
                            <View style={styles.errorBox}>
                                <Text
                                    style={styles.errorText}
                                >
                                    {errorMessage}
                                </Text>
                            </View>
                        )}

                        <Pressable
                            onPress={handleSave}
                            disabled={loading}
                            style={({ pressed }) => [
                                styles.saveButton,

                                pressed &&
                                !loading &&
                                styles.pressed,

                                loading &&
                                styles.disabled,
                            ]}
                        >
                            {loading ? (
                                <ActivityIndicator />
                            ) : (
                                <Text
                                    style={
                                        styles.saveButtonText
                                    }
                                >
                                    Salvar culto
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
    keyboardType?: "default" | "numeric";
    onChangeText: (
        value: string
    ) => void;
};

function Field({
    label,
    value,
    placeholder,
    keyboardType = "default",
    onChangeText,
}: FieldProps) {
    return (
        <View style={styles.field}>
            <Text style={styles.label}>
                {label}
            </Text>

            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                keyboardType={keyboardType}
                autoCapitalize="sentences"
                style={styles.input}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },

    safeArea: {
        flex: 1,
        backgroundColor: "#f7f7f6",
    },

    content: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 180,
    },

    header: {
        marginBottom: 30,
    },

    cancel: {
        fontSize: 14,
        fontWeight: "600",
        color: "#666666",
        marginBottom: 24,
    },

    title: {
        fontSize: 29,
        fontWeight: "700",
        color: "#111111",
    },

    subtitle: {
        marginTop: 6,
        fontSize: 14,
        color: "#717171",
    },

    form: {
        gap: 18,
    },

    row: {
        flexDirection: "row",
        gap: 12,
    },

    field: {
        gap: 7,
    },

    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#292929",
    },

    input: {
        height: 50,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: "#ddddda",
        borderRadius: 12,
        backgroundColor: "#ffffff",
        fontSize: 16,
        color: "#111111",
    },

    divider: {
        height: 1,
        marginVertical: 6,
        backgroundColor: "#e2e2df",
    },

    sectionTitle: {
        fontSize: 17,
        fontWeight: "700",
    },

    sectionDescription: {
        marginTop: -10,
        fontSize: 13,
        lineHeight: 19,
        color: "#757575",
    },

    errorBox: {
        padding: 12,
        borderRadius: 10,
        backgroundColor: "#fff1f1",
    },

    errorText: {
        fontSize: 14,
        lineHeight: 20,
        color: "#8b1e1e",
    },

    imagePicker: {
        width: "100%",
        aspectRatio: 16 / 9,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#ddddda",
        borderRadius: 14,
        backgroundColor: "#ffffff",
    },

    imagePreview: {
        width: "100%",
        height: "100%",
        resizeMode: "contain",
        backgroundColor: "#f2f2f0",
    },

    imagePlaceholder: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },

    imagePlaceholderTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: "#292929",
    },

    imagePlaceholderText: {
        marginTop: 5,
        fontSize: 13,
        color: "#777777",
    },

    changeImage: {
        fontSize: 13,
        fontWeight: "600",
        color: "#555555",
    },

    saveButton: {
        minHeight: 52,
        marginTop: 8,
        borderRadius: 12,
        backgroundColor: "#171717",
        alignItems: "center",
        justifyContent: "center",
    },

    saveButtonText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#ffffff",
    },

    pressed: {
        opacity: 0.82,
    },

    disabled: {
        opacity: 0.55,
    },
});