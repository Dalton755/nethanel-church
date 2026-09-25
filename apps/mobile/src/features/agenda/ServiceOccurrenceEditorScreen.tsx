import { useState } from "react";
import {
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
  } = useOrganization();

  const [theme, setTheme] = useState(service.theme ?? "");
  const [preacherName, setPreacherName] = useState(
    service.preacher_name ?? ""
  );
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

  const displayedImage =
    selectedImage?.uri ??
    (!removeCurrentImage ? service.cover_image_url : null) ??
    null;

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
      const { error: serviceError } = await supabase
        .from("services")
        .update({
          theme: theme.trim() || null,
          preacher_name: preacherName.trim() || null,
          bible_reference: bibleReference.trim() || null,
        })
        .eq("event_id", service.id)
        .eq("organization_id", activeOrganization.id);

      if (serviceError) throw serviceError;

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
      <TextInput
        value={preacherName}
        onChangeText={setPreacherName}
        placeholder="Nome do pregador"
        placeholderTextColor="#A1A9B0"
        style={styles.input}
      />

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
