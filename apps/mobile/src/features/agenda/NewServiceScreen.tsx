import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as Phosphor from "phosphor-react-native";
import { File } from "expo-file-system";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  eloColors,
} from "../elo/EloUi";

const P = Phosphor as any;

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
  recurring?: boolean;
  routine_id?: string | null;
  original_date?: string | null;
};

type Props = {
  onCancel: () => void;
  onSaved: () => Promise<void>;
  service?: ServiceEditorData | null;
};

type CreationMode = "single" | "weekly";

type PreacherCandidate = {
  person_id: string;
  person_name: string;
  email: string | null;
  has_login: boolean;
};

type PreacherInvitation = {
  invitation_id: string;
  preacher_person_id: string;
  preacher_name: string;
  theme: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  responded_at: string | null;
  unavailable_reported_at: string | null;
};

type PreacherMode = "church" | "external";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function preacherStatusLabel(value: PreacherInvitation["status"]) {
  switch (value) {
    case "accepted":
      return "Confirmado";
    case "declined":
      return "Recusado";
    case "cancelled":
      return "Cancelado";
    default:
      return "Aguardando resposta";
  }
}


const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function createTime(hour: number, minute: number) {
  const value = new Date();
  value.setHours(hour, minute, 0, 0);
  return value;
}

function combineDateAndTime(date: Date, time: Date) {
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

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sqlTime(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes()
  ).padStart(2, "0")}:00`;
}

export function NewServiceScreen({
  onCancel,
  onSaved,
  service = null,
}: Props) {
  const {
    activeOrganization,
    activeUnit,
    permissions,
    can,
    canAtOrganization,
  } = useOrganization();

  const isEditing = service !== null;

  const initialStart = service
    ? new Date(service.starts_at)
    : new Date();

  const [mode, setMode] = useState<CreationMode>("single");
  const [title, setTitle] = useState(service?.title ?? "");
  const [eventDate, setEventDate] = useState(
    new Date(
      initialStart.getFullYear(),
      initialStart.getMonth(),
      initialStart.getDate()
    )
  );
  const [weekday, setWeekday] = useState(initialStart.getDay());
  const [startTime, setStartTime] = useState(
    service ? new Date(service.starts_at) : createTime(19, 30)
  );
  const [endTime, setEndTime] = useState(
    service?.ends_at ? new Date(service.ends_at) : createTime(21, 0)
  );
  const [locationName, setLocationName] = useState(
    service?.location_name ?? activeUnit?.name ?? ""
  );
  const [theme, setTheme] = useState(service?.theme ?? "");
  const [preacherName, setPreacherName] = useState(
    service?.preacher_name ?? ""
  );
  const [preacherMode, setPreacherMode] = useState<PreacherMode>(
    service?.preacher_name ? "external" : "church"
  );
  const [preacherCandidates, setPreacherCandidates] =
    useState<PreacherCandidate[]>([]);
  const [preacherInvitation, setPreacherInvitation] =
    useState<PreacherInvitation | null>(null);
  const [preacherSearch, setPreacherSearch] = useState("");
  const [showPreacherPicker, setShowPreacherPicker] = useState(false);
  const [selectedPreacherId, setSelectedPreacherId] =
    useState<string | null>(null);
  const [selectedPreacherName, setSelectedPreacherName] =
    useState<string | null>(null);
  const [loadingPreachers, setLoadingPreachers] = useState(false);
  const [savingPreacher, setSavingPreacher] = useState(false);
  const [bibleReference, setBibleReference] = useState(
    service?.bible_reference ?? ""
  );
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);

  const [picker, setPicker] =
    useState<"date" | "start" | "end" | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const canManage =
    permissions.includes("agenda.manage") &&
    permissions.includes("services.manage");

  const canInvitePreacher =
    can("schedules.manage") ||
    canAtOrganization("schedules.manage");

  const displayedImage =
    selectedImage?.uri ??
    (!removeCurrentImage ? service?.cover_image_url : null) ??
    null;

  const durationMinutes = useMemo(() => {
    const start = startTime.getHours() * 60 + startTime.getMinutes();
    const end = endTime.getHours() * 60 + endTime.getMinutes();
    return end - start;
  }, [startTime, endTime]);


  const filteredPreacherCandidates = useMemo(() => {
    const query = normalizeSearch(preacherSearch);

    return preacherCandidates.filter((item) => {
      if (!query) return true;

      return normalizeSearch(
        [item.person_name, item.email].filter(Boolean).join(" ")
      ).includes(query);
    });
  }, [preacherCandidates, preacherSearch]);

  async function loadPreacherContext() {
    if (
      !activeOrganization ||
      !activeUnit ||
      !canInvitePreacher
    ) {
      setPreacherCandidates([]);
      setPreacherInvitation(null);
      return;
    }

    setLoadingPreachers(true);

    try {
      const candidatesPromise = service
        ? supabase.rpc("list_preacher_candidates", {
            p_organization_id: activeOrganization.id,
            p_event_id: service.id,
          })
        : supabase.rpc("list_preacher_candidates_for_unit", {
            p_organization_id: activeOrganization.id,
            p_unit_id: activeUnit.id,
          });

      const invitationPromise = service
        ? supabase.rpc("get_event_preacher_invitation", {
            p_organization_id: activeOrganization.id,
            p_event_id: service.id,
          })
        : Promise.resolve({ data: [], error: null });

      const [candidatesResponse, invitationResponse] =
        await Promise.all([
          candidatesPromise,
          invitationPromise,
        ]);

      if (candidatesResponse.error) throw candidatesResponse.error;
      if (invitationResponse.error) throw invitationResponse.error;

      const candidates =
        (candidatesResponse.data ?? []) as PreacherCandidate[];
      const invitation =
        ((invitationResponse.data ?? [])[0] ??
          null) as PreacherInvitation | null;

      setPreacherCandidates(candidates);
      setPreacherInvitation(invitation);

      if (
        invitation &&
        ["pending", "accepted"].includes(invitation.status)
      ) {
        setPreacherMode("church");
        setSelectedPreacherId(invitation.preacher_person_id);
        setSelectedPreacherName(invitation.preacher_name);
        setPreacherName("");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os pregadores."
      );
    } finally {
      setLoadingPreachers(false);
    }
  }

  useEffect(() => {
    void loadPreacherContext();
  }, [
    service?.id,
    activeOrganization?.id,
    activeUnit?.id,
    canInvitePreacher,
  ]);

  async function cancelCurrentPreacherInvitation({
    openPicker = false,
    switchToExternal = false,
  }: {
    openPicker?: boolean;
    switchToExternal?: boolean;
  } = {}) {
    if (!activeOrganization || !preacherInvitation) {
      if (switchToExternal) setPreacherMode("external");
      if (openPicker) setShowPreacherPicker(true);
      return;
    }

    setSavingPreacher(true);

    try {
      const { error } = await supabase.rpc(
        "cancel_preacher_invitation",
        {
          p_organization_id: activeOrganization.id,
          p_invitation_id: preacherInvitation.invitation_id,
        }
      );

      if (error) throw error;

      setPreacherInvitation(null);
      setSelectedPreacherId(null);
      setSelectedPreacherName(null);

      if (switchToExternal) {
        setPreacherMode("external");
        setShowPreacherPicker(false);
      } else if (openPicker) {
        setPreacherMode("church");
        setShowPreacherPicker(true);
      }

      await loadPreacherContext();
    } catch (error) {
      Alert.alert(
        "Não foi possível alterar o pregador",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingPreacher(false);
    }
  }

  function chooseChurchPreacher(person: PreacherCandidate) {
    if (!person.has_login) {
      Alert.alert(
        "Acesso ao Elo necessário",
        "Essa pessoa ainda não possui acesso ao aplicativo. Libere o acesso antes de enviar o convite por Push."
      );
      return;
    }

    setSelectedPreacherId(person.person_id);
    setSelectedPreacherName(person.person_name);
    setShowPreacherPicker(false);
  }

  async function sendPreacherInvite() {
    if (
      !service ||
      !activeOrganization ||
      !selectedPreacherId
    ) {
      return;
    }

    const selected = preacherCandidates.find(
      (item) => item.person_id === selectedPreacherId
    );

    if (!selected?.has_login) {
      Alert.alert(
        "Acesso ao Elo necessário",
        "Escolha uma pessoa com acesso ao Elo para receber o convite."
      );
      return;
    }

    setSavingPreacher(true);
    setErrorMessage(null);

    try {
      // Garante que tema e demais detalhes já estejam sincronizados
      // antes do convite ser enviado.
      await saveSingle();

      const { error } = await supabase.rpc("invite_preacher", {
        p_organization_id: activeOrganization.id,
        p_event_id: service.id,
        p_preacher_person_id: selectedPreacherId,
        p_theme: theme.trim() || null,
      });

      if (error) throw error;

      await loadPreacherContext();

      Alert.alert(
        "Convite enviado",
        `${selected.person_name} receberá o convite no Elo e por Push para aceitar ou recusar.`
      );
    } catch (error) {
      Alert.alert(
        "Convite não enviado",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingPreacher(false);
    }
  }

  function requestExternalPreacher() {
    if (
      preacherInvitation &&
      ["pending", "accepted"].includes(preacherInvitation.status)
    ) {
      Alert.alert(
        "Usar pregador externo?",
        "O convite atual será cancelado. Depois você poderá informar o nome do pregador externo.",
        [
          { text: "Voltar", style: "cancel" },
          {
            text: "Continuar",
            style: "destructive",
            onPress: () =>
              void cancelCurrentPreacherInvitation({
                switchToExternal: true,
              }),
          },
        ]
      );
      return;
    }

    setPreacherMode("external");
    setShowPreacherPicker(false);
    setSelectedPreacherId(null);
    setSelectedPreacherName(null);
  }

  async function pickImage() {
    setErrorMessage(null);

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage(
        "Permita o acesso às fotos para escolher uma imagem."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
      setRemoveCurrentImage(false);
    }
  }

  async function uploadCover(targetId: string) {
    if (
      !selectedImage ||
      !activeOrganization ||
      !activeUnit
    ) {
      return null;
    }

    const imageFile = new File(selectedImage.uri);
    const fileData = await imageFile.arrayBuffer();

    if (fileData.byteLength < 1024) {
      throw new Error("A imagem selecionada não pôde ser lida.");
    }

    const mimeType = selectedImage.mimeType ?? "image/jpeg";
    const extension =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";

    const imagePath =
      `${activeOrganization.id}/${activeUnit.id}/${targetId}/cover.${extension}`;

    const { error } = await supabase.storage
      .from("event-covers")
      .upload(imagePath, fileData, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) throw error;

    return imagePath;
  }

  async function updateCover(eventId: string, path: string | null) {
    if (!activeOrganization) return;

    const { error } = await supabase
      .from("events")
      .update({ cover_image_path: path })
      .eq("id", eventId)
      .eq("organization_id", activeOrganization.id);

    if (error) throw error;
  }

  async function saveSingle() {
    if (!activeOrganization || !activeUnit) {
      throw new Error("Igreja ou unidade ativa não encontrada.");
    }

    const startsAt = combineDateAndTime(eventDate, startTime);
    const endsAt = combineDateAndTime(eventDate, endTime);

    if (endsAt <= startsAt) {
      throw new Error("O término precisa ser posterior ao início.");
    }

    let eventId: string;

    if (service) {
      const { data, error } = await supabase.rpc(
        "update_service_event",
        {
          p_event_id: service.id,
          p_organization_id: activeOrganization.id,
          p_title: title.trim(),
          p_starts_at: startsAt.toISOString(),
          p_ends_at: endsAt.toISOString(),
          p_location_name:
            locationName.trim() || activeUnit.name,
          p_visibility: service.visibility || "members",
          p_theme: theme.trim() || null,
          p_preacher_name:
            preacherMode === "external"
              ? preacherName.trim() || null
              : preacherInvitation?.status === "accepted"
                ? preacherInvitation.preacher_name
                : null,
          p_bible_reference: bibleReference.trim() || null,
          p_livestream_url: service.livestream_url,
          p_notes: service.notes,
        }
      );

      if (error) throw error;

      eventId =
        (data as { event_id?: string } | null)?.event_id ??
        service.id;
    } else {
      const { data, error } = await supabase.rpc(
        "create_service_event",
        {
          p_organization_id: activeOrganization.id,
          p_unit_id: activeUnit.id,
          p_title: title.trim(),
          p_starts_at: startsAt.toISOString(),
          p_ends_at: endsAt.toISOString(),
          p_location_name:
            locationName.trim() || activeUnit.name,
          p_visibility: "members",
          p_theme: theme.trim() || null,
          p_preacher_name:
            preacherMode === "external"
              ? preacherName.trim() || null
              : null,
          p_bible_reference: bibleReference.trim() || null,
          p_livestream_url: null,
          p_notes: null,
        }
      );

      if (error) throw error;

      eventId =
        (data as { event_id?: string } | null)?.event_id ?? "";

      if (!eventId) {
        throw new Error(
          "O culto foi criado, mas o identificador não foi retornado."
        );
      }
    }

    if (selectedImage) {
      const path = await uploadCover(eventId);
      if (path) await updateCover(eventId, path);
    } else if (removeCurrentImage && service?.cover_image_path) {
      await updateCover(eventId, null);
      await supabase.storage
        .from("event-covers")
        .remove([service.cover_image_path]);
    }

    return eventId;
  }

  async function saveWeekly() {
    if (!activeOrganization || !activeUnit) {
      throw new Error("Igreja ou unidade ativa não encontrada.");
    }

    if (durationMinutes < 15) {
      throw new Error(
        "O culto recorrente precisa ter pelo menos 15 minutos."
      );
    }

    const { data, error } = await supabase.rpc(
      "create_service_routine",
      {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_name: title.trim(),
        p_weekday: weekday,
        p_start_time: sqlTime(startTime),
        p_duration_minutes: durationMinutes,
        p_start_date: localDate(eventDate),
        p_location_name:
          locationName.trim() || activeUnit.name,
        p_visibility: "members",
      }
    );

    if (error) throw error;

    const routineResult = Array.isArray(data) ? data[0] : data;
    const routineId =
      (routineResult as { id?: string } | null)?.id ?? null;

    if (!routineId) {
      throw new Error(
        "A rotina foi criada, mas o identificador não foi retornado."
      );
    }

    if (selectedImage) {
      const path = await uploadCover(routineId);

      if (path) {
        const { error: coverError } = await supabase.rpc(
          "set_service_routine_cover",
          {
            p_organization_id: activeOrganization.id,
            p_routine_id: routineId,
            p_cover_image_path: path,
          }
        );

        if (coverError) throw coverError;
      }
    }
  }

  async function handleSave() {
    setErrorMessage(null);

    if (!canManage) {
      setErrorMessage(
        "Seu perfil não possui permissão para gerenciar cultos."
      );
      return;
    }

    if (title.trim().length < 2) {
      setErrorMessage("Informe o nome do culto.");
      return;
    }

    setLoading(true);

    try {
      let inviteWarning: string | null = null;

      if (!isEditing && mode === "weekly") {
        await saveWeekly();
      } else {
        const eventId = await saveSingle();

        if (
          !isEditing &&
          preacherMode === "church" &&
          selectedPreacherId &&
          activeOrganization
        ) {
          const { error: inviteError } = await supabase.rpc(
            "invite_preacher",
            {
              p_organization_id: activeOrganization.id,
              p_event_id: eventId,
              p_preacher_person_id: selectedPreacherId,
              p_theme: theme.trim() || null,
            }
          );

          if (inviteError) {
            inviteWarning = inviteError.message;
          }
        }
      }

      await onSaved();

      if (inviteWarning) {
        Alert.alert(
          "Culto criado",
          `O culto foi salvo, mas o convite do pregador não foi enviado: ${inviteWarning}`
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o culto."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDateChange(
    event: DateTimePickerEvent,
    value?: Date
  ) {
    if (Platform.OS === "android") setPicker(null);
    if (event.type === "dismissed" || !value) return;

    setEventDate(value);
    if (mode === "weekly") setWeekday(value.getDay());
  }

  function handleTimeChange(
    event: DateTimePickerEvent,
    value: Date | undefined,
    type: "start" | "end"
  ) {
    if (Platform.OS === "android") setPicker(null);
    if (event.type === "dismissed" || !value) return;

    if (type === "start") setStartTime(value);
    else setEndTime(value);
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable onPress={onCancel} style={styles.backButton}>
              <P.ArrowLeftIcon
                size={20}
                color={eloColors.ink}
                weight="bold"
              />
            </Pressable>

            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>ELO • CULTOS</Text>
              <Text style={styles.title}>
                {isEditing ? "Editar culto" : "Novo culto"}
              </Text>
              <Text style={styles.subtitle}>
                {activeOrganization?.name}
              </Text>
            </View>
          </View>

          {!isEditing ? (
            <>
              <Text style={styles.sectionLabel}>Como esse culto acontece?</Text>

              <View style={styles.modeRow}>
                <ModeCard
                  selected={mode === "single"}
                  icon="CalendarBlankIcon"
                  title="Único"
                  description="Uma data específica"
                  onPress={() => setMode("single")}
                />

                <ModeCard
                  selected={mode === "weekly"}
                  icon="ArrowsClockwiseIcon"
                  title="Recorrente"
                  description="Toda semana"
                  onPress={() => {
                    setMode("weekly");
                    setWeekday(eventDate.getDay());
                  }}
                />
              </View>
            </>
          ) : null}

          {mode === "weekly" && !isEditing ? (
            <View style={styles.recurringNotice}>
              <P.ArrowsClockwiseIcon
                size={20}
                color={eloColors.blue}
                weight="duotone"
              />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>
                  Rotina semanal do Elo
                </Text>
                <Text style={styles.noticeText}>
                  O Elo criará automaticamente os próximos cultos e manterá
                  a agenda atualizada.
                </Text>
              </View>
            </View>
          ) : null}

          {!isEditing || mode === "single" || isEditing ? (
            <>
              <Text style={styles.sectionLabel}>
                {mode === "weekly" && !isEditing
                  ? "Imagem padrão da rotina"
                  : "Imagem de capa"}
              </Text>

              <Pressable
                onPress={() => void pickImage()}
                style={styles.imageCard}
              >
                {displayedImage ? (
                  <Image
                    source={{ uri: displayedImage }}
                    style={styles.image}
                  />
                ) : (
                  <View style={styles.imageEmpty}>
                    <P.ImageIcon
                      size={30}
                      color={eloColors.muted}
                      weight="duotone"
                    />
                    <Text style={styles.imageTitle}>
                      Adicionar imagem
                    </Text>
                    <Text style={styles.imageText}>
                      {mode === "weekly" && !isEditing
                        ? "Será usada nos próximos cultos • JPG, PNG ou WEBP"
                        : "Opcional • JPG, PNG ou WEBP"}
                    </Text>
                  </View>
                )}
              </Pressable>

              {displayedImage ? (
                <Pressable
                  onPress={() => {
                    setSelectedImage(null);
                    setRemoveCurrentImage(true);
                  }}
                  style={styles.removeImage}
                >
                  <Text style={styles.removeImageText}>
                    Remover imagem
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          <Text style={styles.label}>Nome do culto</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ex.: Culto de Ensino"
            placeholderTextColor="#A1A9B0"
            style={styles.input}
          />

          {mode === "weekly" && !isEditing ? (
            <>
              <Text style={styles.label}>Dia da semana</Text>

              <View style={styles.weekdays}>
                {WEEKDAYS.map((label, index) => (
                  <Pressable
                    key={label}
                    onPress={() => setWeekday(index)}
                    style={[
                      styles.weekdayChip,
                      weekday === index && styles.weekdayChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekdayText,
                        weekday === index &&
                          styles.weekdayTextSelected,
                      ]}
                    >
                      {label.slice(0, 3)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Começar em</Text>
            </>
          ) : (
            <Text style={styles.label}>Data</Text>
          )}

          <Pressable
            onPress={() => setPicker("date")}
            style={styles.selectField}
          >
            <P.CalendarDotsIcon
              size={20}
              color={eloColors.blue}
              weight="duotone"
            />
            <Text style={styles.selectValue}>
              {formatDate(eventDate)}
            </Text>
            <P.CaretRightIcon
              size={18}
              color="#9AA4AE"
              weight="bold"
            />
          </Pressable>

          <View style={styles.timeRow}>
            <View style={styles.timeColumn}>
              <Text style={styles.label}>Início</Text>
              <Pressable
                onPress={() => setPicker("start")}
                style={styles.selectField}
              >
                <P.ClockIcon
                  size={20}
                  color={eloColors.blue}
                  weight="duotone"
                />
                <Text style={styles.selectValue}>
                  {formatTime(startTime)}
                </Text>
              </Pressable>
            </View>

            <View style={styles.timeColumn}>
              <Text style={styles.label}>Término</Text>
              <Pressable
                onPress={() => setPicker("end")}
                style={styles.selectField}
              >
                <P.ClockIcon
                  size={20}
                  color={eloColors.blue}
                  weight="duotone"
                />
                <Text style={styles.selectValue}>
                  {formatTime(endTime)}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.label}>Local</Text>
          <TextInput
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Ex.: Templo principal"
            placeholderTextColor="#A1A9B0"
            style={styles.input}
          />

          {mode === "single" || isEditing ? (
            <>
              <Text style={styles.sectionLabel}>Mensagem do culto</Text>

              <Text style={styles.label}>Tema</Text>
              <TextInput
                value={theme}
                onChangeText={setTheme}
                placeholder="Opcional"
                placeholderTextColor="#A1A9B0"
                style={styles.input}
              />

              <Text style={styles.label}>Pregador</Text>

              <View style={styles.preacherModeRow}>
                <Pressable
                  onPress={() => {
                    setPreacherMode("church");
                    setPreacherName("");
                  }}
                  style={[
                    styles.preacherMode,
                    preacherMode === "church" &&
                      styles.preacherModeSelected,
                  ]}
                >
                  <P.UsersThreeIcon
                    size={18}
                    color={
                      preacherMode === "church"
                        ? eloColors.blue
                        : eloColors.muted
                    }
                    weight="duotone"
                  />
                  <Text
                    style={[
                      styles.preacherModeText,
                      preacherMode === "church" &&
                        styles.preacherModeTextSelected,
                    ]}
                  >
                    Pessoa da igreja
                  </Text>
                </Pressable>

                <Pressable
                  onPress={requestExternalPreacher}
                  style={[
                    styles.preacherMode,
                    preacherMode === "external" &&
                      styles.preacherModeSelected,
                  ]}
                >
                  <P.UserPlusIcon
                    size={18}
                    color={
                      preacherMode === "external"
                        ? eloColors.blue
                        : eloColors.muted
                    }
                    weight="duotone"
                  />
                  <Text
                    style={[
                      styles.preacherModeText,
                      preacherMode === "external" &&
                        styles.preacherModeTextSelected,
                    ]}
                  >
                    Pregador externo
                  </Text>
                </Pressable>
              </View>

              {preacherMode === "external" ? (
                <>
                  <TextInput
                    value={preacherName}
                    onChangeText={setPreacherName}
                    placeholder="Nome do pregador externo"
                    placeholderTextColor="#A1A9B0"
                    style={[styles.input, styles.preacherTopGap]}
                  />
                  <Text style={styles.preacherHelp}>
                    O nome será exibido no culto, mas não haverá convite
                    por Push porque essa pessoa não está vinculada ao Elo.
                  </Text>
                </>
              ) : !canInvitePreacher ? (
                <View style={styles.preacherInfo}>
                  <P.LockKeyIcon
                    size={18}
                    color={eloColors.muted}
                    weight="duotone"
                  />
                  <Text style={styles.preacherInfoText}>
                    Seu perfil pode editar o culto, mas não possui
                    permissão para gerenciar convites de escala.
                  </Text>
                </View>
              ) : loadingPreachers ? (
                <View style={styles.preacherLoading}>
                  <ActivityIndicator />
                  <Text style={styles.preacherHelp}>
                    Carregando pessoas da igreja...
                  </Text>
                </View>
              ) : preacherInvitation &&
                ["pending", "accepted"].includes(
                  preacherInvitation.status
                ) ? (
                <View style={styles.preacherStatusCard}>
                  <View style={styles.preacherStatusIcon}>
                    <P.MicrophoneStageIcon
                      size={21}
                      color={eloColors.blue}
                      weight="duotone"
                    />
                  </View>

                  <View style={styles.preacherStatusCopy}>
                    <Text style={styles.preacherSelectedName}>
                      {preacherInvitation.preacher_name}
                    </Text>
                    <Text style={styles.preacherStatusText}>
                      {preacherInvitation.unavailable_reported_at
                        ? "Troca solicitada pelo pregador"
                        : preacherStatusLabel(
                            preacherInvitation.status
                          )}
                    </Text>
                  </View>

                  <P.CheckCircleIcon
                    size={20}
                    color={
                      preacherInvitation.status === "accepted"
                        ? eloColors.green
                        : eloColors.blue
                    }
                    weight="fill"
                  />

                  <View style={styles.preacherStatusActions}>
                    <EloActionButton
                      label={
                        preacherInvitation.unavailable_reported_at
                          ? "Escolher outro pregador"
                          : preacherInvitation.status === "accepted"
                            ? "Trocar pregador"
                            : "Cancelar convite"
                      }
                      variant="secondary"
                      icon="ArrowsClockwiseIcon"
                      loading={savingPreacher}
                      onPress={() =>
                        Alert.alert(
                          preacherInvitation.status === "accepted"
                            ? "Trocar pregador?"
                            : "Cancelar convite?",
                          preacherInvitation.status === "accepted"
                            ? "O pregador confirmado será removido deste culto e você poderá escolher outra pessoa."
                            : "O convite atual será cancelado.",
                          [
                            { text: "Voltar", style: "cancel" },
                            {
                              text:
                                preacherInvitation.status === "accepted"
                                  ? "Trocar"
                                  : "Cancelar convite",
                              style: "destructive",
                              onPress: () =>
                                void cancelCurrentPreacherInvitation({
                                  openPicker:
                                    preacherInvitation.status ===
                                    "accepted",
                                }),
                            },
                          ]
                        )
                      }
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={() =>
                      setShowPreacherPicker((value) => !value)
                    }
                    style={styles.preacherSelector}
                  >
                    <View style={styles.preacherSelectorIcon}>
                      <P.UserCircleIcon
                        size={21}
                        color={eloColors.blue}
                        weight="duotone"
                      />
                    </View>

                    <View style={styles.preacherStatusCopy}>
                      <Text style={styles.preacherSelectorLabel}>
                        {selectedPreacherName
                          ? "Pregador selecionado"
                          : "Escolher pessoa da igreja"}
                      </Text>
                      <Text
                        style={[
                          styles.preacherSelectorValue,
                          !selectedPreacherName &&
                            styles.preacherSelectorPlaceholder,
                        ]}
                      >
                        {selectedPreacherName ??
                          "Toque para pesquisar por nome"}
                      </Text>
                    </View>

                    <P.CaretDownIcon
                      size={18}
                      color={eloColors.muted}
                      weight="bold"
                    />
                  </Pressable>

                  {showPreacherPicker ? (
                    <View style={styles.preacherPicker}>
                      <TextInput
                        value={preacherSearch}
                        onChangeText={setPreacherSearch}
                        placeholder="Buscar por nome ou e-mail"
                        placeholderTextColor="#A1A9B0"
                        autoFocus
                        style={styles.input}
                      />

                      <View style={styles.preacherList}>
                        {filteredPreacherCandidates.length === 0 ? (
                          <Text style={styles.preacherEmpty}>
                            Nenhuma pessoa encontrada.
                          </Text>
                        ) : (
                          filteredPreacherCandidates
                            .slice(0, 40)
                            .map((person) => (
                              <Pressable
                                key={person.person_id}
                                onPress={() =>
                                  chooseChurchPreacher(person)
                                }
                                style={[
                                  styles.preacherPerson,
                                  !person.has_login &&
                                    styles.preacherPersonDisabled,
                                ]}
                              >
                                <View style={styles.preacherAvatar}>
                                  <P.UserIcon
                                    size={17}
                                    color={
                                      person.has_login
                                        ? eloColors.blue
                                        : eloColors.muted
                                    }
                                    weight="duotone"
                                  />
                                </View>

                                <View style={styles.preacherStatusCopy}>
                                  <Text style={styles.preacherPersonName}>
                                    {person.person_name}
                                  </Text>
                                  <Text style={styles.preacherPersonMeta}>
                                    {person.has_login
                                      ? person.email ??
                                        "Acesso ao Elo ativo"
                                      : "Sem acesso ao Elo — Push indisponível"}
                                  </Text>
                                </View>

                                {selectedPreacherId ===
                                person.person_id ? (
                                  <P.CheckCircleIcon
                                    size={19}
                                    color={eloColors.blue}
                                    weight="fill"
                                  />
                                ) : null}
                              </Pressable>
                            ))
                        )}
                      </View>
                    </View>
                  ) : null}

                  {selectedPreacherId ? (
                    <View style={styles.preacherInviteAction}>
                      <Text style={styles.preacherHelp}>
                        {isEditing
                          ? "O tema acima será enviado junto com o convite."
                          : "Ao criar o culto, o Elo enviará este convite por Push automaticamente."}
                      </Text>

                      {isEditing ? (
                        <EloActionButton
                          label="Enviar convite por Push"
                          icon="PaperPlaneTiltIcon"
                          loading={savingPreacher}
                          onPress={() => void sendPreacherInvite()}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}

              <Text style={styles.label}>Referência bíblica</Text>
              <TextInput
                value={bibleReference}
                onChangeText={setBibleReference}
                placeholder="Ex.: João 3:16"
                placeholderTextColor="#A1A9B0"
                style={styles.input}
              />
            </>
          ) : (
            <View style={styles.tipCard}>
              <P.InfoIcon
                size={19}
                color={eloColors.muted}
                weight="duotone"
              />
              <Text style={styles.tipText}>
                Tema, pregador e detalhes podem ser definidos depois em cada
                ocorrência quando necessário.
              </Text>
            </View>
          )}

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <View style={styles.footer}>
            <EloActionButton
              label={
                isEditing
                  ? "Salvar alterações"
                  : mode === "weekly"
                    ? `Criar culto toda ${WEEKDAYS[weekday].toLowerCase()}`
                    : "Criar culto"
              }
              icon={
                mode === "weekly" && !isEditing
                  ? "ArrowsClockwiseIcon"
                  : "CheckIcon"
              }
              loading={loading}
              onPress={() => void handleSave()}
            />
          </View>
        </ScrollView>

        {picker === "date" ? (
          <DateTimePicker
            value={eventDate}
            mode="date"
            minimumDate={isEditing ? undefined : new Date()}
            onChange={handleDateChange}
          />
        ) : null}

        {picker === "start" ? (
          <DateTimePicker
            value={startTime}
            mode="time"
            is24Hour
            onChange={(event, value) =>
              handleTimeChange(event, value, "start")
            }
          />
        ) : null}

        {picker === "end" ? (
          <DateTimePicker
            value={endTime}
            mode="time"
            is24Hour
            onChange={(event, value) =>
              handleTimeChange(event, value, "end")
            }
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeCard({
  selected,
  icon,
  title,
  description,
  onPress,
}: {
  selected: boolean;
  icon: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const Icon = P[icon] ?? P.CalendarBlankIcon;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeCard,
        selected && styles.modeCardSelected,
      ]}
    >
      <View
        style={[
          styles.modeIcon,
          selected && styles.modeIconSelected,
        ]}
      >
        <Icon
          size={22}
          color={selected ? eloColors.blue : eloColors.muted}
          weight="duotone"
        />
      </View>

      <Text style={styles.modeTitle}>{title}</Text>
      <Text style={styles.modeDescription}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    backgroundColor: eloColors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 44,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  headingCopy: { flex: 1 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: eloColors.muted,
  },
  title: {
    marginTop: 3,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "900",
    color: eloColors.ink,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: eloColors.muted,
  },
  sectionLabel: {
    marginTop: 28,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: eloColors.muted,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
  },
  modeCard: {
    flex: 1,
    minHeight: 120,
    padding: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  modeCardSelected: {
    borderColor: "#8CC5E8",
    backgroundColor: "#F2F9FD",
  },
  modeIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#F2F4F6",
  },
  modeIconSelected: {
    backgroundColor: "#E6F3FB",
  },
  modeTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  modeDescription: {
    marginTop: 3,
    fontSize: 11,
    color: eloColors.muted,
  },
  recurringNotice: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#EAF5FB",
  },
  noticeCopy: { flex: 1 },
  noticeTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.blue,
  },
  noticeText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 17,
    color: "#557084",
  },
  imageCard: {
    overflow: "hidden",
    minHeight: 190,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    resizeMode: "cover",
  },
  imageEmpty: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
  },
  imageTitle: {
    marginTop: 9,
    fontSize: 14,
    fontWeight: "800",
    color: eloColors.ink,
  },
  imageText: {
    marginTop: 4,
    fontSize: 11,
    color: eloColors.muted,
  },
  removeImage: {
    alignSelf: "flex-end",
    paddingVertical: 9,
  },
  removeImageText: {
    fontSize: 11,
    fontWeight: "700",
    color: eloColors.danger,
  },
  label: {
    marginTop: 18,
    marginBottom: 7,
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.ink,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: eloColors.ink,
  },
  preacherModeRow: {
    flexDirection: "row",
    gap: 8,
  },
  preacherMode: {
    flex: 1,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  preacherModeSelected: {
    borderColor: "#8CC5E8",
    backgroundColor: "#F2F9FD",
  },
  preacherModeText: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  preacherModeTextSelected: {
    color: eloColors.blue,
  },
  preacherTopGap: {
    marginTop: 10,
  },
  preacherHelp: {
    marginTop: 7,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  preacherInfo: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#EAF5FB",
  },
  preacherInfoText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 16,
    color: "#557084",
  },
  preacherLoading: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  preacherSelector: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  preacherSelectorIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#EAF5FB",
  },
  preacherSelectorLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: eloColors.muted,
  },
  preacherSelectorValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.ink,
  },
  preacherSelectorPlaceholder: {
    fontWeight: "600",
    color: "#A1A9B0",
  },
  preacherPicker: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#F8FAFB",
  },
  preacherList: {
    marginTop: 8,
    gap: 6,
  },
  preacherPerson: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  preacherPersonDisabled: {
    opacity: 0.5,
  },
  preacherAvatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: eloColors.surfaceSoft,
  },
  preacherPersonName: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.ink,
  },
  preacherPersonMeta: {
    marginTop: 2,
    fontSize: 9,
    color: eloColors.muted,
  },
  preacherEmpty: {
    paddingVertical: 14,
    textAlign: "center",
    fontSize: 10,
    color: eloColors.muted,
  },
  preacherInviteAction: {
    marginTop: 10,
    gap: 8,
  },
  preacherStatusCard: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#B8DCEC",
    borderRadius: 15,
    backgroundColor: "#F2F9FD",
  },
  preacherStatusIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#E4F2FA",
  },
  preacherStatusCopy: {
    flex: 1,
    minWidth: 150,
  },
  preacherSelectedName: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  preacherStatusText: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.blue,
  },
  preacherStatusActions: {
    flexBasis: "100%",
    marginTop: 2,
  },
  weekdays: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  weekdayChip: {
    minWidth: 43,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  weekdayChipSelected: {
    borderColor: eloColors.blue,
    backgroundColor: "#EAF5FB",
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  weekdayTextSelected: {
    color: eloColors.blue,
  },
  selectField: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  selectValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: eloColors.ink,
  },
  timeRow: {
    flexDirection: "row",
    gap: 10,
  },
  timeColumn: { flex: 1 },
  tipCard: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 13,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: eloColors.muted,
  },
  errorBox: {
    marginTop: 18,
    padding: 13,
    borderRadius: 14,
    backgroundColor: eloColors.dangerSoft,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    color: eloColors.danger,
  },
  footer: {
    marginTop: 26,
  },
});
