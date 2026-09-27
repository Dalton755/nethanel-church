import { useMemo, useState } from "react";
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
  EloCard,
  EloScreen,
  EloState,
  eloColors,
  eloSharedStyles,
} from "../elo/EloUi";

const P = Phosphor as any;

const COLOR_PRESETS = [
  "#2387C9",
  "#5965D8",
  "#7A4FC5",
  "#B14583",
  "#C4563A",
  "#D48B20",
  "#2F8A62",
  "#397B63",
  "#41556F",
  "#17191C",
];

function normalizeColor(value: string) {
  const clean = value.trim().toUpperCase();
  if (!clean) return "#2387C9";
  return clean.startsWith("#") ? clean : `#${clean}`;
}

function isValidColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(normalizeColor(value));
}

export function ChurchPersonalizationScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const {
    activeOrganization,
    canAtOrganization,
    refreshContext,
  } = useOrganization();

  const canManage = canAtOrganization("organization.manage");

  const [name, setName] = useState(activeOrganization?.name ?? "");
  const [primaryColor, setPrimaryColor] = useState(
    activeOrganization?.primary_color ?? "#2387C9"
  );
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  const displayLogo =
    selectedImage?.uri ??
    (!removeLogo ? activeOrganization?.logo_url : null) ??
    null;

  const normalizedColor = useMemo(
    () => normalizeColor(primaryColor),
    [primaryColor]
  );

  if (!activeOrganization) {
    return (
      <EloScreen title="Personalização da igreja" onBack={onBack}>
        <EloState
          title="Nenhuma igreja ativa"
          description="Selecione uma igreja para personalizar."
          icon="ChurchIcon"
        />
      </EloScreen>
    );
  }

  if (!canManage) {
    return (
      <EloScreen title="Personalização da igreja" onBack={onBack}>
        <EloState
          title="Acesso restrito"
          description="Somente o administrador da igreja pode alterar a identidade visual."
          icon="LockKeyIcon"
        />
      </EloScreen>
    );
  }

  async function pickLogo() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Acesso às fotos",
        "Permita o acesso às fotos para escolher a logo da igreja."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
      setRemoveLogo(false);
    }
  }

  async function uploadLogo() {
    if (!selectedImage || !activeOrganization) {
      return activeOrganization?.logo_url ?? null;
    }

    const file = new File(selectedImage.uri);
    const bytes = await file.arrayBuffer();

    if (bytes.byteLength < 1024) {
      throw new Error("A imagem selecionada não pôde ser lida.");
    }

    if (bytes.byteLength > 5 * 1024 * 1024) {
      throw new Error("A logo deve ter no máximo 5 MB.");
    }

    const mimeType = selectedImage.mimeType ?? "image/jpeg";
    const extension =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";

    const path = `${activeOrganization.id}/logo.${extension}`;

    const { error } = await supabase.storage
      .from("church-branding")
      .upload(path, bytes, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) throw error;

    const oldPaths = ["jpg", "png", "webp"]
      .filter((item) => item !== extension)
      .map((item) => `${activeOrganization.id}/logo.${item}`);

    if (oldPaths.length > 0) {
      await supabase.storage
        .from("church-branding")
        .remove(oldPaths);
    }

    const { data } = supabase.storage
      .from("church-branding")
      .getPublicUrl(path);

    return `${data.publicUrl}?v=${Date.now()}`;
  }

  async function save() {
    if (!activeOrganization) return;

    const cleanName = name.trim();

    if (cleanName.length < 2) {
      Alert.alert("Nome inválido", "Informe o nome da igreja.");
      return;
    }

    if (!isValidColor(primaryColor)) {
      Alert.alert(
        "Cor inválida",
        "Use uma cor hexadecimal com 6 dígitos, por exemplo #2387C9."
      );
      return;
    }

    setSaving(true);

    try {
      let logoUrl = activeOrganization.logo_url ?? null;

      if (removeLogo) {
        await supabase.storage
          .from("church-branding")
          .remove([
            `${activeOrganization.id}/logo.jpg`,
            `${activeOrganization.id}/logo.png`,
            `${activeOrganization.id}/logo.webp`,
          ]);
        logoUrl = null;
      } else if (selectedImage) {
        logoUrl = await uploadLogo();
      }

      const { error } = await supabase.rpc("save_organization_branding", {
        p_organization_id: activeOrganization.id,
        p_name: cleanName,
        p_primary_color: normalizedColor,
        p_logo_url: logoUrl,
      });

      if (error) throw error;

      await refreshContext({ silent: true });
      setSelectedImage(null);
      setRemoveLogo(false);

      Alert.alert(
        "Personalização salva",
        "A identidade da igreja já foi aplicada ao Elo."
      );
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
      title="Personalização da igreja"
      eyebrow="IDENTIDADE • ELO"
      subtitle="Defina como sua igreja aparece para membros, líderes e equipes."
      onBack={onBack}
    >
      <Text style={eloSharedStyles.sectionTitle}>Prévia</Text>

      <View
        style={[
          styles.preview,
          { borderTopColor: normalizedColor },
        ]}
      >
        <View style={styles.previewLogo}>
          {displayLogo ? (
            <Image
              source={{ uri: displayLogo }}
              style={styles.previewLogoImage}
            />
          ) : (
            <P.ChurchIcon
              size={30}
              color={normalizedColor}
              weight="duotone"
            />
          )}
        </View>

        <View style={styles.previewCopy}>
          <Text style={styles.previewEyebrow}>MINHA IGREJA NO ELO</Text>
          <Text style={styles.previewName}>
            {name.trim() || activeOrganization.name}
          </Text>
          <Text style={styles.previewText}>
            A cor principal será usada nos destaques e ações do aplicativo.
          </Text>
        </View>
      </View>

      <Text style={eloSharedStyles.sectionTitle}>Logo</Text>

      <EloCard>
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            {displayLogo ? (
              <Image
                source={{ uri: displayLogo }}
                style={styles.logoImage}
              />
            ) : (
              <P.ImageIcon
                size={28}
                color={eloColors.muted}
                weight="duotone"
              />
            )}
          </View>

          <View style={styles.logoCopy}>
            <Text style={eloSharedStyles.cardTitle}>Logo da igreja</Text>
            <Text style={styles.help}>
              Recomendado: imagem quadrada, PNG/JPG/WebP, até 5 MB.
            </Text>
          </View>
        </View>

        <View style={styles.logoActions}>
          <View style={styles.flexButton}>
            <EloActionButton
              label={displayLogo ? "Trocar logo" : "Escolher logo"}
              icon="ImageIcon"
              variant="secondary"
              onPress={() => void pickLogo()}
            />
          </View>

          {displayLogo ? (
            <Pressable
              onPress={() => {
                setSelectedImage(null);
                setRemoveLogo(true);
              }}
              style={styles.removeButton}
            >
              <P.TrashIcon
                size={18}
                color={eloColors.danger}
                weight="duotone"
              />
              <Text style={styles.removeText}>Remover</Text>
            </Pressable>
          ) : null}
        </View>
      </EloCard>

      <Text style={eloSharedStyles.sectionTitle}>Identidade</Text>

      <EloCard>
        <Text style={styles.label}>Nome da igreja</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nome da igreja"
          placeholderTextColor="#A1A9B0"
          autoCapitalize="words"
          maxLength={120}
          style={styles.input}
        />

        <Text style={styles.label}>Cor predominante</Text>

        <View style={styles.colorGrid}>
          {COLOR_PRESETS.map((color) => {
            const selected = normalizedColor === color;

            return (
              <Pressable
                key={color}
                accessibilityLabel={`Usar cor ${color}`}
                onPress={() => setPrimaryColor(color)}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  selected && styles.colorOptionSelected,
                ]}
              >
                {selected ? (
                  <P.CheckIcon size={18} color="#FFFFFF" weight="bold" />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Cor personalizada</Text>
        <TextInput
          value={primaryColor}
          onChangeText={(value) =>
            setPrimaryColor(
              normalizeColor(value.replace(/[^0-9a-fA-F#]/g, "").slice(0, 7))
            )
          }
          autoCapitalize="characters"
          maxLength={7}
          placeholder="#2387C9"
          placeholderTextColor="#A1A9B0"
          style={styles.input}
        />

        <View style={styles.colorPreviewRow}>
          <View
            style={[
              styles.colorPreviewDot,
              { backgroundColor: isValidColor(primaryColor)
                  ? normalizedColor
                  : eloColors.line },
            ]}
          />
          <Text style={styles.colorPreviewText}>
            {isValidColor(primaryColor)
              ? normalizedColor
              : "Cor ainda incompleta"}
          </Text>
        </View>
      </EloCard>

      <View style={styles.notice}>
        <P.InfoIcon
          size={18}
          color={eloColors.blue}
          weight="duotone"
        />
        <Text style={styles.noticeText}>
          A personalização identifica a sua igreja dentro do Nethanel Elo.
          O ícone instalado do aplicativo continua sendo o Elo para manter
          uma única instalação segura para todas as igrejas.
        </Text>
      </View>

      <View style={styles.footer}>
        <EloActionButton
          label="Salvar personalização"
          icon="CheckIcon"
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 16,
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: eloColors.line,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
  },
  previewLogo: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#F3F6F8",
  },
  previewLogoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  previewCopy: {
    flex: 1,
  },
  previewEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
    color: eloColors.muted,
  },
  previewName: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "900",
    color: eloColors.ink,
  },
  previewText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBox: {
    width: 66,
    height: 66,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#F3F6F8",
  },
  logoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  logoCopy: {
    flex: 1,
  },
  help: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  logoActions: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flexButton: {
    flex: 1,
  },
  removeButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#F0DADA",
    borderRadius: 14,
    backgroundColor: "#FFF8F8",
  },
  removeText: {
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.danger,
  },
  label: {
    marginTop: 14,
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
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorOption: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  colorPreviewRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorPreviewDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  colorPreviewText: {
    fontSize: 11,
    fontWeight: "700",
    color: eloColors.muted,
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
    marginTop: 22,
  },
});
