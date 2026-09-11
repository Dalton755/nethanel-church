import { useState } from "react";

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

import {
    SafeAreaView,
} from "react-native-safe-area-context";

import {
    Ionicons,
} from "@expo/vector-icons";

import DateTimePicker, {
    type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import * as ImagePicker from "expo-image-picker";

import {
    File,
} from "expo-file-system";

import {
    useOrganization,
} from "../../contexts/OrganizationContext";

import {
    supabase,
} from "../../lib/supabase";


export type ServiceEditorData = {
    id: string;

    title: string;

    starts_at: string;

    ends_at: string | null;

    location_name: string | null;

    visibility: string;

    cover_image_path: string | null;

    cover_image_url: string | null;

    theme: string | null;

    preacher_name: string | null;

    bible_reference: string | null;

    livestream_url: string | null;

    notes: string | null;
};


type NewServiceScreenProps = {
    onCancel: () => void;

    onSaved: () => Promise<void>;

    service?: ServiceEditorData | null;
};


function createTime(
    hour: number,
    minute: number
) {
    const value = new Date();

    value.setHours(
        hour,
        minute,
        0,
        0
    );

    return value;
}


function combineDateAndTime(
    date: Date,
    time: Date
) {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        time.getHours(),
        time.getMinutes(),
        0,
        0
    );
}


function formatDateLabel(
    value: Date
) {
    const formatted =
        new Intl.DateTimeFormat(
            "pt-BR",
            {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
            }
        ).format(value);

    return (
        formatted
            .charAt(0)
            .toUpperCase() +
        formatted.slice(1)
    );
}


function formatTimeLabel(
    value: Date
) {
    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            hour: "2-digit",
            minute: "2-digit",
        }
    ).format(value);
}


export function NewServiceScreen({
    onCancel,
    onSaved,
    service = null,
}: NewServiceScreenProps) {
    const {
        activeOrganization,
        activeUnit,
        permissions,
    } = useOrganization();


    const isEditing =
        service !== null;


    const initialStartsAt =
        service
            ? new Date(
                  service.starts_at
              )
            : new Date();


    const initialEventDate =
        new Date(
            initialStartsAt.getFullYear(),
            initialStartsAt.getMonth(),
            initialStartsAt.getDate()
        );


    const initialStartTime =
        service
            ? new Date(
                  service.starts_at
              )
            : createTime(
                  19,
                  30
              );


    const initialEndTime =
        service?.ends_at
            ? new Date(
                  service.ends_at
              )
            : createTime(
                  21,
                  0
              );


    const [
        title,
        setTitle,
    ] =
        useState(
            service?.title ??
                ""
        );


    const [
        eventDate,
        setEventDate,
    ] =
        useState(
            initialEventDate
        );


    const [
        startTime,
        setStartTime,
    ] =
        useState(
            initialStartTime
        );


    const [
        endTime,
        setEndTime,
    ] =
        useState(
            initialEndTime
        );


    const [
        locationName,
        setLocationName,
    ] =
        useState(
            service?.location_name ??
                activeUnit?.name ??
                ""
        );


    const [
        theme,
        setTheme,
    ] =
        useState(
            service?.theme ??
                ""
        );


    const [
        preacherName,
        setPreacherName,
    ] =
        useState(
            service?.preacher_name ??
                ""
        );


    const [
        bibleReference,
        setBibleReference,
    ] =
        useState(
            service?.bible_reference ??
                ""
        );


    const [
        selectedImage,
        setSelectedImage,
    ] =
        useState<
            ImagePicker.ImagePickerAsset
            | null
        >(
            null
        );


    const [
        removeCurrentImage,
        setRemoveCurrentImage,
    ] =
        useState(false);


    const [
        showDatePicker,
        setShowDatePicker,
    ] =
        useState(false);


    const [
        showStartPicker,
        setShowStartPicker,
    ] =
        useState(false);


    const [
        showEndPicker,
        setShowEndPicker,
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
            "agenda.manage"
        ) &&
        permissions.includes(
            "services.manage"
        );


    const displayedImageUri =
        selectedImage?.uri ??
        (
            !removeCurrentImage
                ? service?.cover_image_url
                : null
        ) ??
        null;


    function closePickers() {
        setShowDatePicker(
            false
        );

        setShowStartPicker(
            false
        );

        setShowEndPicker(
            false
        );
    }


    function openDatePicker() {
        closePickers();

        setShowDatePicker(
            true
        );
    }


    function openStartPicker() {
        closePickers();

        setShowStartPicker(
            true
        );
    }


    function openEndPicker() {
        closePickers();

        setShowEndPicker(
            true
        );
    }


    function handleDateChange(
        event: DateTimePickerEvent,
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
            setEventDate(
                selectedDate
            );
        }
    }


    function handleStartTimeChange(
        event: DateTimePickerEvent,
        selectedTime?: Date
    ) {
        if (
            Platform.OS ===
            "android"
        ) {
            setShowStartPicker(
                false
            );
        }

        if (
            event.type ===
            "dismissed"
        ) {
            return;
        }

        if (selectedTime) {
            setStartTime(
                selectedTime
            );
        }
    }


    function handleEndTimeChange(
        event: DateTimePickerEvent,
        selectedTime?: Date
    ) {
        if (
            Platform.OS ===
            "android"
        ) {
            setShowEndPicker(
                false
            );
        }

        if (
            event.type ===
            "dismissed"
        ) {
            return;
        }

        if (selectedTime) {
            setEndTime(
                selectedTime
            );
        }
    }


    async function handlePickImage() {
        setErrorMessage(
            null
        );

        const permission =
            await ImagePicker
                .requestMediaLibraryPermissionsAsync();

        if (
            !permission.granted
        ) {
            setErrorMessage(
                "Permita o acesso às fotos para escolher uma imagem."
            );

            return;
        }


        const result =
            await ImagePicker
                .launchImageLibraryAsync(
                    {
                        mediaTypes: [
                            "images",
                        ],

                        allowsEditing:
                            false,

                        quality:
                            0.85,
                    }
                );


        if (
            !result.canceled
        ) {
            setSelectedImage(
                result.assets[0]
            );

            setRemoveCurrentImage(
                false
            );
        }
    }


    function handleRemoveImage() {
        setSelectedImage(
            null
        );

        setRemoveCurrentImage(
            true
        );
    }


    async function uploadSelectedCover(
        eventId: string
    ) {
        if (
            !selectedImage ||
            !activeOrganization ||
            !activeUnit
        ) {
            return null;
        }


        const imageFile =
            new File(
                selectedImage.uri
            );


        const fileData =
            await imageFile
                .arrayBuffer();


        if (
            fileData.byteLength <
            1024
        ) {
            throw new Error(
                `A imagem selecionada não pôde ser lida corretamente (${fileData.byteLength} bytes).`
            );
        }


        const mimeType =
            selectedImage.mimeType ??
            "image/jpeg";


        if (
            ![
                "image/jpeg",
                "image/png",
                "image/webp",
            ].includes(
                mimeType
            )
        ) {
            throw new Error(
                "Use uma imagem JPG, PNG ou WEBP."
            );
        }


        let extension =
            "jpg";


        if (
            mimeType ===
            "image/png"
        ) {
            extension =
                "png";
        }


        if (
            mimeType ===
            "image/webp"
        ) {
            extension =
                "webp";
        }


        const imagePath =
            `${activeOrganization.id}/` +
            `${activeUnit.id}/` +
            `${eventId}/` +
            `cover.${extension}`;


        const {
            error: uploadError,
        } =
            await supabase.storage
                .from(
                    "event-covers"
                )
                .upload(
                    imagePath,
                    fileData,
                    {
                        contentType:
                            mimeType,

                        upsert:
                            true,
                    }
                );


        if (uploadError) {
            throw uploadError;
        }


        return imagePath;
    }


    async function updateCoverPath(
        eventId: string,
        imagePath:
            string | null
    ) {
        if (
            !activeOrganization
        ) {
            return;
        }


        const {
            error,
        } =
            await supabase
                .from(
                    "events"
                )
                .update({
                    cover_image_path:
                        imagePath,
                })
                .eq(
                    "id",
                    eventId
                )
                .eq(
                    "organization_id",
                    activeOrganization.id
                );


        if (error) {
            throw error;
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
                "Seu perfil não possui permissão para gerenciar cultos."
            );

            return;
        }


        if (
            title
                .trim()
                .length <
            2
        ) {
            setErrorMessage(
                "Informe o nome do culto."
            );

            return;
        }


        const startsAt =
            combineDateAndTime(
                eventDate,
                startTime
            );


        const endsAt =
            combineDateAndTime(
                eventDate,
                endTime
            );


        if (
            endsAt.getTime() <
            startsAt.getTime()
        ) {
            setErrorMessage(
                "O término não pode ser anterior ao início."
            );

            return;
        }


        setLoading(
            true
        );


        try {
            let eventId:
                string;


            if (isEditing) {
                const {
                    data,
                    error,
                } =
                    await supabase.rpc(
                        "update_service_event",
                        {
                            p_event_id:
                                service.id,

                            p_organization_id:
                                activeOrganization.id,

                            p_title:
                                title.trim(),

                            p_starts_at:
                                startsAt.toISOString(),

                            p_ends_at:
                                endsAt.toISOString(),

                            p_location_name:
                                locationName
                                    .trim() ||
                                activeUnit.name,

                            p_visibility:
                                service.visibility ||
                                "members",

                            p_theme:
                                theme
                                    .trim() ||
                                null,

                            p_preacher_name:
                                preacherName
                                    .trim() ||
                                null,

                            p_bible_reference:
                                bibleReference
                                    .trim() ||
                                null,

                            p_livestream_url:
                                service.livestream_url,

                            p_notes:
                                service.notes,
                        }
                    );


                if (error) {
                    throw error;
                }


                const updated =
                    data as {
                        event_id?:
                            string;
                    } | null;


                eventId =
                    updated?.event_id ??
                    service.id;
            } else {
                const {
                    data,
                    error,
                } =
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
                                endsAt.toISOString(),

                            p_location_name:
                                locationName
                                    .trim() ||
                                activeUnit.name,

                            p_visibility:
                                "members",

                            p_theme:
                                theme
                                    .trim() ||
                                null,

                            p_preacher_name:
                                preacherName
                                    .trim() ||
                                null,

                            p_bible_reference:
                                bibleReference
                                    .trim() ||
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
                        event_id?:
                            string;
                    } | null;


                if (
                    !created?.event_id
                ) {
                    throw new Error(
                        "O culto foi criado, mas o identificador não foi retornado."
                    );
                }


                eventId =
                    created.event_id;
            }


            if (
                selectedImage
            ) {
                const oldPath =
                    service
                        ?.cover_image_path ??
                    null;


                const newPath =
                    await uploadSelectedCover(
                        eventId
                    );


                if (newPath) {
                    try {
                        await updateCoverPath(
                            eventId,
                            newPath
                        );
                    } catch (
                        error
                    ) {
                        await supabase.storage
                            .from(
                                "event-covers"
                            )
                            .remove([
                                newPath,
                            ]);

                        throw error;
                    }


                    if (
                        oldPath &&
                        oldPath !==
                            newPath
                    ) {
                        await supabase.storage
                            .from(
                                "event-covers"
                            )
                            .remove([
                                oldPath,
                            ]);
                    }
                }
            } else if (
                isEditing &&
                removeCurrentImage &&
                service
                    .cover_image_path
            ) {
                const oldPath =
                    service
                        .cover_image_path;


                await updateCoverPath(
                    eventId,
                    null
                );


                await supabase.storage
                    .from(
                        "event-covers"
                    )
                    .remove([
                        oldPath,
                    ]);
            }


            await onSaved();
        } catch (error) {
            const message =
                error instanceof
                Error
                    ? error.message
                    : isEditing
                      ? "Não foi possível atualizar o culto."
                      : "Não foi possível salvar o culto.";


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
            edges={[
                "top",
            ]}
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
                    <View
                        style={
                            styles.header
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
                                ? "Editar culto"
                                : "Novo culto"}
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


                    <View
                        style={
                            styles.form
                        }
                    >
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
                                Imagem de capa
                            </Text>


                            <Pressable
                                onPress={
                                    handlePickImage
                                }
                                style={
                                    styles.imagePicker
                                }
                            >
                                {displayedImageUri ? (
                                    <Image
                                        source={{
                                            uri: displayedImageUri,
                                        }}
                                        style={
                                            styles.imagePreview
                                        }
                                    />
                                ) : (
                                    <View
                                        style={
                                            styles.imagePlaceholder
                                        }
                                    >
                                        <Ionicons
                                            name="image-outline"
                                            size={
                                                25
                                            }
                                            color="#777777"
                                        />

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


                            <View
                                style={
                                    styles.imageActions
                                }
                            >
                                <Pressable
                                    onPress={
                                        handlePickImage
                                    }
                                >
                                    <Text
                                        style={
                                            styles.imageAction
                                        }
                                    >
                                        {displayedImageUri
                                            ? "Trocar imagem"
                                            : "Escolher imagem"}
                                    </Text>
                                </Pressable>


                                {displayedImageUri && (
                                    <Pressable
                                        onPress={
                                            handleRemoveImage
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.removeImage
                                            }
                                        >
                                            Remover
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        </View>


                        <Field
                            label="Nome do culto"
                            value={
                                title
                            }
                            onChangeText={
                                setTitle
                            }
                            placeholder="Ex.: Culto de Ensino"
                        />


                        <SelectorField
                            label="Data"
                            value={
                                formatDateLabel(
                                    eventDate
                                )
                            }
                            icon="calendar-outline"
                            onPress={
                                openDatePicker
                            }
                        />


                        {showDatePicker && (
                            <PickerArea
                                onDone={() =>
                                    setShowDatePicker(
                                        false
                                    )
                                }
                            >
                                <DateTimePicker
                                    value={
                                        eventDate
                                    }
                                    mode="date"
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
                            </PickerArea>
                        )}


                        <View
                            style={
                                styles.row
                            }
                        >
                            <View
                                style={
                                    styles.flex
                                }
                            >
                                <SelectorField
                                    label="Início"
                                    value={
                                        formatTimeLabel(
                                            startTime
                                        )
                                    }
                                    icon="time-outline"
                                    onPress={
                                        openStartPicker
                                    }
                                />
                            </View>


                            <View
                                style={
                                    styles.flex
                                }
                            >
                                <SelectorField
                                    label="Término"
                                    value={
                                        formatTimeLabel(
                                            endTime
                                        )
                                    }
                                    icon="time-outline"
                                    onPress={
                                        openEndPicker
                                    }
                                />
                            </View>
                        </View>


                        {showStartPicker && (
                            <PickerArea
                                onDone={() =>
                                    setShowStartPicker(
                                        false
                                    )
                                }
                            >
                                <DateTimePicker
                                    value={
                                        startTime
                                    }
                                    mode="time"
                                    is24Hour
                                    display={
                                        Platform.OS ===
                                        "ios"
                                            ? "spinner"
                                            : "default"
                                    }
                                    onChange={
                                        handleStartTimeChange
                                    }
                                />
                            </PickerArea>
                        )}


                        {showEndPicker && (
                            <PickerArea
                                onDone={() =>
                                    setShowEndPicker(
                                        false
                                    )
                                }
                            >
                                <DateTimePicker
                                    value={
                                        endTime
                                    }
                                    mode="time"
                                    is24Hour
                                    display={
                                        Platform.OS ===
                                        "ios"
                                            ? "spinner"
                                            : "default"
                                    }
                                    onChange={
                                        handleEndTimeChange
                                    }
                                />
                            </PickerArea>
                        )}


                        <Field
                            label="Local"
                            value={
                                locationName
                            }
                            onChangeText={
                                setLocationName
                            }
                            placeholder={
                                activeUnit
                                    ?.name ??
                                "Ex.: Templo principal"
                            }
                        />


                        <View
                            style={
                                styles.divider
                            }
                        />


                        <View>
                            <Text
                                style={
                                    styles.sectionTitle
                                }
                            >
                                Informações da mensagem
                            </Text>

                            <Text
                                style={
                                    styles.sectionDescription
                                }
                            >
                                Esses dados são opcionais e podem ser alterados depois.
                            </Text>
                        </View>


                        <Field
                            label="Tema"
                            value={
                                theme
                            }
                            onChangeText={
                                setTheme
                            }
                            placeholder="Ex.: A importância da Palavra"
                        />


                        <Field
                            label="Pregador"
                            value={
                                preacherName
                            }
                            onChangeText={
                                setPreacherName
                            }
                            placeholder="Ex.: Pr. João Silva"
                        />


                        <Field
                            label="Referência bíblica"
                            value={
                                bibleReference
                            }
                            onChangeText={
                                setBibleReference
                            }
                            placeholder="Ex.: 2 Timóteo 3:16"
                        />


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
                                        : "Salvar culto"}
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

    onChangeText: (
        value: string
    ) => void;
};


function Field({
    label,
    value,
    placeholder,
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
                autoCapitalize="sentences"
                style={
                    styles.input
                }
            />
        </View>
    );
}


type SelectorFieldProps = {
    label: string;

    value: string;

    icon:
        | "calendar-outline"
        | "time-outline";

    onPress: () => void;
};


function SelectorField({
    label,
    value,
    icon,
    onPress,
}: SelectorFieldProps) {
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


            <Pressable
                onPress={
                    onPress
                }
                style={({
                    pressed,
                }) => [
                    styles.selector,

                    pressed &&
                        styles.selectorPressed,
                ]}
            >
                <Ionicons
                    name={
                        icon
                    }
                    size={
                        19
                    }
                    color="#666666"
                />


                <Text
                    style={
                        styles.selectorText
                    }
                    numberOfLines={
                        1
                    }
                >
                    {value}
                </Text>


                <Ionicons
                    name="chevron-forward"
                    size={
                        17
                    }
                    color="#999999"
                />
            </Pressable>
        </View>
    );
}


type PickerAreaProps = {
    children:
        React.ReactNode;

    onDone: () => void;
};


function PickerArea({
    children,
    onDone,
}: PickerAreaProps) {
    return (
        <>
            {Platform.OS ===
                "ios" ? (
                <View
                    style={
                        styles.pickerArea
                    }
                >
                    {children}

                    <Pressable
                        onPress={
                            onDone
                        }
                        style={
                            styles.pickerDoneButton
                        }
                    >
                        <Text
                            style={
                                styles.pickerDoneText
                            }
                        >
                            Concluir
                        </Text>
                    </Pressable>
                </View>
            ) : (
                children
            )}
        </>
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
                180,
        },

        header: {
            marginBottom:
                30,
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

            fontSize:
                14,

            color:
                "#717171",
        },

        form: {
            gap:
                18,
        },

        row: {
            flexDirection:
                "row",

            gap:
                12,
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

        selector: {
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

        selectorPressed: {
            backgroundColor:
                "#f2f2ef",
        },

        selectorText: {
            flex:
                1,

            fontSize:
                15,

            fontWeight:
                "500",

            color:
                "#202020",
        },

        pickerArea: {
            overflow:
                "hidden",

            borderWidth:
                1,

            borderColor:
                "#ddddda",

            borderRadius:
                14,

            backgroundColor:
                "#ffffff",
        },

        pickerDoneButton: {
            minHeight:
                44,

            alignItems:
                "center",

            justifyContent:
                "center",

            borderTopWidth:
                1,

            borderTopColor:
                "#ececea",
        },

        pickerDoneText: {
            fontSize:
                14,

            fontWeight:
                "700",

            color:
                "#333333",
        },

        divider: {
            height:
                1,

            marginVertical:
                5,

            backgroundColor:
                "#e2e2df",
        },

        sectionTitle: {
            fontSize:
                17,

            fontWeight:
                "700",

            color:
                "#1a1a1a",
        },

        sectionDescription: {
            marginTop:
                5,

            fontSize:
                13,

            lineHeight:
                19,

            color:
                "#757575",
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

        imagePicker: {
            width:
                "100%",

            aspectRatio:
                16 / 9,

            overflow:
                "hidden",

            borderWidth:
                1,

            borderColor:
                "#ddddda",

            borderRadius:
                14,

            backgroundColor:
                "#ffffff",
        },

        imagePreview: {
            width:
                "100%",

            height:
                "100%",

            resizeMode:
                "contain",

            backgroundColor:
                "#f2f2f0",
        },

        imagePlaceholder: {
            flex:
                1,

            alignItems:
                "center",

            justifyContent:
                "center",
        },

        imagePlaceholderTitle: {
            marginTop:
                8,

            fontSize:
                15,

            fontWeight:
                "700",

            color:
                "#292929",
        },

        imagePlaceholderText: {
            marginTop:
                5,

            fontSize:
                13,

            color:
                "#777777",
        },

        imageActions: {
            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                20,
        },

        imageAction: {
            fontSize:
                13,

            fontWeight:
                "600",

            color:
                "#555555",
        },

        removeImage: {
            fontSize:
                13,

            fontWeight:
                "600",

            color:
                "#a12828",
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
                0.82,
        },

        disabled: {
            opacity:
                0.55,
        },
    });