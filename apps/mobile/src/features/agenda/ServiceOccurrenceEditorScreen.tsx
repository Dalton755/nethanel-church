import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Phosphor from "phosphor-react-native";
import { File } from "expo-file-system";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloScreen,
  eloColors,
} from "../elo/EloUi";
import type { ServiceEditorData } from "./NewServiceScreen";

const P = Phosphor as any;

type Props = {
  service: ServiceEditorData;
  onBack: () => void;
  onSaved: () => Promise<void>;
};

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ServiceOccurrenceEditorScreen({
  service,
  onBack,
  onSaved,
}: Props) {
  const {
    activeOrganization,
    activeUnit,
    permissions,
    can,
    canAtOrganization,
  } = useOrganization();

  const [theme, setTheme] = useState(service.theme ?? "");
  const [preacherName, setPreacherName] = useState(
    service.preacher_name ?? ""
  );
  const [preacherMode, setPreacherMode] = useState<PreacherMode>(
    service.preacher_name ? "external" : "church"
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
    service.bible_reference ?? ""
  );
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removeCurrentImage, setRemoveCurrentImage] =
    useState(false);
  const [saving, setSaving] = useState(false);

  const canManage =
    permissions.includes("agenda.manage") &&
    permissions.includes("services.manage");

  const canInvitePreacher =
    can("schedules.manage") ||
    canAtOrganization("schedules.manage");

  const displayedImage =
    selectedImage?.uri ??
    (!removeCurrentImage ? service.cover_image_url : null) ??
    null;


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
    if (!activeOrganization || !canInvitePreacher) {
      setPreacherCandidates([]);
      setPreacherInvitation(null);
      return;
    }

    setLoadingPreachers(true);

    try {
      const [candidatesResponse, invitationResponse] =
        await Promise.all([
          supabase.rpc("list_preacher_candidates", {
            p_organization_id: activeOrganization.id,
            p_event_id: service.id,
          }),
          supabase.rpc("get_event_preacher_invitation", {
            p_organization_id: activeOrganization.id,
            p_event_id: service.id,
          }),
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
      Alert.alert(
        "Pregador",
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
    service.id,
    activeOrganization?.id,
    canInvitePreacher,
  ]);

  function chooseChurchPreacher(person: PreacherCandidate) {
    if (!person.has_login) {
      Alert.alert(
        "Acesso ao Elo necessário",
        "Essa pessoa está cadastrada na igreja, mas ainda não possui acesso ao Elo para receber o convite por Push."
      );
      return;
    }

    setSelectedPreacherId(person.person_id);
    setSelectedPreacherName(person.person_name);
    setShowPreacherPicker(false);
  }

  async function persistMessageDetails() {
    if (!activeOrganization) {
      throw new Error("Igreja ativa não encontrada.");
    }

    const { error } = await supabase
      .from("services")
      .update({
        theme: theme.trim() || null,
        preacher_name:
          preacherMode === "external"
            ? preacherName.trim() || null
            : preacherInvitation?.status === "accepted"
              ? preacherInvitation.preacher_name
              : null,
        bible_reference: bibleReference.trim() || null,
      })
      .eq("event_id", service.id)
      .eq("organization_id", activeOrganization.id);

    if (error) throw error;
  }

  async function sendPreacherInvite() {
    if (
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

    try {
      await persistMessageDetails();

      const { error } = await supabase.rpc("invite_preacher", {
        p_organization_id: activeOrganization.id,
        p_event_id: service.id,
        p_preacher_person_id: selectedPreacherId,
        p_theme: theme.trim() || null,
      });

      if (error) throw error;

      setShowPreacherPicker(false);
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

  async function cancelCurrentInvitation({
    switchToExternal = false,
    openPicker = false,
  }: {
    switchToExternal?: boolean;
    openPicker?: boolean;
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

  function requestExternalPreacher() {
    if (
      preacherInvitation &&
      ["pending", "accepted"].includes(preacherInvitation.status)
    ) {
      Alert.alert(
        "Usar pregador externo?",
        "O convite atual será cancelado e você poderá informar o nome do pregador externo.",
        [
          { text: "Voltar", style: "cancel" },
          {
            text: "Continuar",
            style: "destructive",
            onPress: () =>
              void cancelCurrentInvitation({
                switchToExternal: true,
              }),
          },
        ]
      );
      return;
    }

    setPreacherMode("external");
    setSelectedPreacherId(null);
    setSelectedPreacherName(null);
    setShowPreacherPicker(false);
  }

  async function pickImage() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Acesso às fotos",
        "Permita o acesso às fotos para adicionar uma imagem."
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

  async function uploadCover() {
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
      `${activeOrganization.id}/${activeUnit.id}/${service.id}/cover.${extension}`;

    const { error } = await supabase.storage
      .from("event-covers")
      .upload(imagePath, fileData, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) throw error;

    return imagePath;
  }

  async function save() {
    if (!activeOrganization) return;

    if (!canManage) {
      Alert.alert(
        "Sem permissão",
        "Seu perfil não pode editar os detalhes deste culto."
      );
      return;
    }

    setSaving(true);

    try {
      await persistMessageDetails();

      if (selectedImage) {
        const imagePath = await uploadCover();

        if (imagePath) {
          const { error } = await supabase
            .from("events")
            .update({ cover_image_path: imagePath })
            .eq("id", service.id)
            .eq("organization_id", activeOrganization.id);

          if (error) throw error;
        }
      } else if (
        removeCurrentImage &&
        service.cover_image_path
      ) {
        const { error } = await supabase
          .from("events")
          .update({ cover_image_path: null })
          .eq("id", service.id)
          .eq("organization_id", activeOrganization.id);

        if (error) throw error;

        await supabase.storage
          .from("event-covers")
          .remove([service.cover_image_path]);
      }

      await onSaved();
    } catch (error) {
      Alert.alert(
        "Não foi possível salvar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <EloScreen
      title="Detalhes do culto"
      eyebrow="ELO • PRÓXIMO CULTO"
      subtitle={service.title}
      onBack={onBack}
    >
      <View style={styles.context}>
        <P.CalendarDotsIcon
          size={18}
          color={eloColors.blue}
          weight="duotone"
        />
        <Text style={styles.contextText}>
          {formatDateTime(service.starts_at)}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Imagem de capa</Text>

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
              Adicionar foto
            </Text>
            <Text style={styles.imageText}>
              Foto exclusiva desta ocorrência
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
            Remover foto
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionLabel}>Mensagem do culto</Text>

      <Text style={styles.label}>Tema</Text>
      <TextInput
        value={theme}
        onChangeText={setTheme}
        placeholder="Ex.: Uma fé que transforma"
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
            O nome será exibido somente nesta ocorrência. Como não há
            usuário vinculado, não será enviado convite por Push.
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
            Seu perfil pode editar este culto, mas não possui permissão
            para gerenciar convites de escala.
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
                : preacherStatusLabel(preacherInvitation.status)}
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
                    ? "O pregador confirmado será removido desta ocorrência e você poderá convidar outra pessoa."
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
                        void cancelCurrentInvitation({
                          openPicker:
                            preacherInvitation.status === "accepted",
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

                        {selectedPreacherId === person.person_id ? (
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
                O tema acima será enviado junto com o convite.
              </Text>
              <EloActionButton
                label="Enviar convite por Push"
                icon="PaperPlaneTiltIcon"
                loading={savingPreacher}
                onPress={() => void sendPreacherInvite()}
              />
            </View>
          ) : null}
        </>
      )}

      <Text style={styles.label}>Referência bíblica</Text>
      <TextInput
        value={bibleReference}
        onChangeText={setBibleReference}
        placeholder="Ex.: Mateus 13:1-23"
        placeholderTextColor="#A1A9B0"
        style={styles.input}
      />

      {service.recurring ? (
        <View style={styles.notice}>
          <P.ArrowsClockwiseIcon
            size={18}
            color={eloColors.blue}
            weight="duotone"
          />
          <Text style={styles.noticeText}>
            Estes dados valem somente para este culto. A rotina semanal
            continua intacta.
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <EloActionButton
          label="Salvar detalhes"
          icon="CheckIcon"
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  context: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: eloColors.surfaceSoft,
  },
  contextText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: eloColors.muted,
  },
  sectionLabel: {
    marginTop: 26,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: eloColors.muted,
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
  notice: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "#EAF5FB",
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: "#557084",
  },
  footer: {
    marginTop: 26,
  },
});
