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

type BrandAssetKind = "logo" | "app-icon" | "splash";

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

function normalizeColor(value: string, fallback = "#2387C9") {
  const clean = value.trim().toUpperCase();
  if (!clean) return fallback;
  return clean.startsWith("#") ? clean : `#${clean}`;
}

function isValidColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(normalizeColor(value));
}

function sanitizeColorInput(value: string) {
  const clean = value.replace(/[^0-9a-fA-F#]/g, "").slice(0, 7);
  return normalizeColor(clean);
}

function assetLabel(kind: BrandAssetKind) {
  if (kind === "logo") return "logo";
  if (kind === "app-icon") return "ícone";
  return "imagem de abertura";
}

function trialDateLabel(value: string | null | undefined) {
  if (!value) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function ChurchPersonalizationScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const {
    activeOrganization,
    planContext,
    canAtOrganization,
    hasPlanFeature,
    refreshContext,
  } = useOrganization();

  const canManage = canAtOrganization("organization.manage");
  const canCustomColors = hasPlanFeature("custom_colors");
  const canCustomAppName = hasPlanFeature("custom_app_name");
  const canCustomIcon = hasPlanFeature("custom_launcher_icon");
  const canCustomSplash = hasPlanFeature("custom_splash");

  const [name, setName] = useState(activeOrganization?.name ?? "");
  const [appName, setAppName] = useState(
    activeOrganization?.app_name ?? activeOrganization?.name ?? ""
  );
  const [primaryColor, setPrimaryColor] = useState(
    activeOrganization?.primary_color ?? "#2387C9"
  );
  const [secondaryColor, setSecondaryColor] = useState(
    activeOrganization?.secondary_color ?? "#DCE9F3"
  );
  const [backgroundColor, setBackgroundColor] = useState(
    activeOrganization?.background_color ?? "#F6F8FB"
  );

  const [selectedLogo, setSelectedLogo] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selectedAppIcon, setSelectedAppIcon] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selectedSplash, setSelectedSplash] =
    useState<ImagePicker.ImagePickerAsset | null>(null);

  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeAppIcon, setRemoveAppIcon] = useState(false);
  const [removeSplash, setRemoveSplash] = useState(false);
  const [saving, setSaving] = useState(false);

  const normalizedPrimary = useMemo(
    () => normalizeColor(primaryColor),
    [primaryColor]
  );
  const normalizedSecondary = useMemo(
    () => normalizeColor(secondaryColor, "#DCE9F3"),
    [secondaryColor]
  );
  const normalizedBackground = useMemo(
    () => normalizeColor(backgroundColor, "#F6F8FB"),
    [backgroundColor]
  );

  const previewPrimary = canCustomColors ? normalizedPrimary : "#2387C9";
  const previewSecondary = canCustomColors ? normalizedSecondary : "#DCE9F3";
  const previewBackground = canCustomColors ? normalizedBackground : "#F6F8FB";

  const displayLogo =
    selectedLogo?.uri ??
    (!removeLogo ? activeOrganization?.logo_url : null) ??
    null;
  const displayAppIcon = canCustomIcon
    ? selectedAppIcon?.uri ??
      (!removeAppIcon ? activeOrganization?.app_icon_url : null) ??
      displayLogo
    : null;
  const displaySplash = canCustomSplash
    ? selectedSplash?.uri ??
      (!removeSplash ? activeOrganization?.splash_url : null) ??
      displayLogo
    : null;

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

  async function pickAsset(kind: BrandAssetKind) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Acesso às fotos",
        "Permita o acesso às fotos para escolher as imagens da igreja."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.95,
    });

    if (result.canceled) return;

    const asset = result.assets[0];

    if (kind === "logo") {
      setSelectedLogo(asset);
      setRemoveLogo(false);
    } else if (kind === "app-icon") {
      setSelectedAppIcon(asset);
      setRemoveAppIcon(false);
    } else {
      setSelectedSplash(asset);
      setRemoveSplash(false);
    }
  }

  async function removeStoredAsset(kind: BrandAssetKind) {
    await supabase.storage
      .from("church-branding")
      .remove(
        ["jpg", "png", "webp"].map(
          (extension) => `${activeOrganization.id}/${kind}.${extension}`
        )
      );
  }

  async function uploadBrandAsset(
    kind: BrandAssetKind,
    asset: ImagePicker.ImagePickerAsset
  ) {
    const file = new File(asset.uri);
    const bytes = await file.arrayBuffer();

    if (bytes.byteLength < 1024) {
      throw new Error(
        `A ${assetLabel(kind)} selecionada não pôde ser lida.`
      );
    }

    if (bytes.byteLength > 5 * 1024 * 1024) {
      throw new Error(`A ${assetLabel(kind)} deve ter no máximo 5 MB.`);
    }

    const mimeType = asset.mimeType ?? "image/jpeg";
    const extension =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const path = `${activeOrganization.id}/${kind}.${extension}`;

    const { error } = await supabase.storage
      .from("church-branding")
      .upload(path, bytes, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) throw error;

    const oldPaths = ["jpg", "png", "webp"]
      .filter((item) => item !== extension)
      .map((item) => `${activeOrganization.id}/${kind}.${item}`);

    if (oldPaths.length > 0) {
      await supabase.storage.from("church-branding").remove(oldPaths);
    }

    const { data } = supabase.storage
      .from("church-branding")
      .getPublicUrl(path);

    return `${data.publicUrl}?v=${Date.now()}`;
  }

  async function resolveAsset(
    kind: BrandAssetKind,
    selected: ImagePicker.ImagePickerAsset | null,
    remove: boolean,
    currentUrl: string | null | undefined
  ) {
    if (remove) {
      await removeStoredAsset(kind);
      return null;
    }

    if (selected) {
      return uploadBrandAsset(kind, selected);
    }

    return currentUrl ?? null;
  }

  async function save() {
    const cleanName = name.trim();
    const cleanAppName = canCustomAppName ? appName.trim() : cleanName;

    if (cleanName.length < 2) {
      Alert.alert("Nome inválido", "Informe o nome da igreja.");
      return;
    }

    if (
      canCustomAppName &&
      (cleanAppName.length < 2 || cleanAppName.length > 40)
    ) {
      Alert.alert(
        "Nome do aplicativo inválido",
        "Use entre 2 e 40 caracteres."
      );
      return;
    }

    if (
      canCustomColors &&
      (!isValidColor(primaryColor) ||
        !isValidColor(secondaryColor) ||
        !isValidColor(backgroundColor))
    ) {
      Alert.alert(
        "Cor inválida",
        "Use cores hexadecimais com 6 dígitos, por exemplo #2387C9."
      );
      return;
    }

    setSaving(true);

    try {
      const logoUrl = await resolveAsset(
        "logo",
        selectedLogo,
        removeLogo,
        activeOrganization.logo_url
      );

      const appIconUrl = canCustomIcon
        ? await resolveAsset(
            "app-icon",
            selectedAppIcon,
            removeAppIcon,
            activeOrganization.app_icon_url
          )
        : null;

      const splashUrl = canCustomSplash
        ? await resolveAsset(
            "splash",
            selectedSplash,
            removeSplash,
            activeOrganization.splash_url
          )
        : null;

      const { error } = await supabase.rpc("save_organization_branding_v2", {
        p_organization_id: activeOrganization.id,
        p_name: cleanName,
        p_primary_color: canCustomColors ? normalizedPrimary : "#2387C9",
        p_secondary_color: canCustomColors ? normalizedSecondary : "#DCE9F3",
        p_background_color: canCustomColors ? normalizedBackground : "#F6F8FB",
        p_logo_url: logoUrl,
        p_app_name: cleanAppName,
        p_app_icon_url: appIconUrl,
        p_splash_url: splashUrl,
      });

      if (error) throw error;

      await refreshContext({ silent: true });
      setSelectedLogo(null);
      setSelectedAppIcon(null);
      setSelectedSplash(null);
      setRemoveLogo(false);
      setRemoveAppIcon(false);
      setRemoveSplash(false);

      Alert.alert(
        "Personalização salva",
        activeOrganization.white_label_enabled
          ? "A identidade foi salva e também ficará disponível para a versão exclusiva da igreja."
          : "A identidade permitida pelo seu plano já foi aplicada dentro do Elo."
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

  const trialEnd = trialDateLabel(planContext?.trial_ends_at);
  const previewName = canCustomAppName
    ? appName.trim() || name.trim() || activeOrganization.name
    : name.trim() || activeOrganization.name;

  return (
    <EloScreen
      title="Personalização da igreja"
      eyebrow="IDENTIDADE • ELO"
      subtitle="A identidade disponível acompanha automaticamente o plano da igreja."
      onBack={onBack}
    >
      {planContext ? (
        <View style={styles.planContextCard}>
          <View style={styles.planContextIcon}>
            {planContext.is_trial ? (
              <P.GiftIcon size={21} color={eloColors.blue} weight="duotone" />
            ) : (
              <P.CrownSimpleIcon size={21} color={eloColors.blue} weight="duotone" />
            )}
          </View>
          <View style={styles.planContextCopy}>
            <Text style={styles.planContextEyebrow}>PLANO ATUAL</Text>
            <Text style={styles.planContextName}>{planContext.name}</Text>
            <Text style={styles.planContextText}>
              {planContext.is_trial && trialEnd
                ? `Teste completo disponível até ${trialEnd}.`
                : `Recursos de identidade liberados conforme ${planContext.base_plan_name}.`}
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>Prévia</Text>

      <View
        style={[
          styles.preview,
          {
            borderTopColor: previewPrimary,
            backgroundColor: previewBackground,
          },
        ]}
      >
        <View
          style={[
            styles.previewLogo,
            { backgroundColor: previewSecondary },
          ]}
        >
          {displayLogo ? (
            <Image source={{ uri: displayLogo }} style={styles.previewLogoImage} />
          ) : (
            <P.ChurchIcon
              size={30}
              color={previewPrimary}
              weight="duotone"
            />
          )}
        </View>

        <View style={styles.previewCopy}>
          <Text style={styles.previewEyebrow}>MINHA IGREJA</Text>
          <Text style={styles.previewName}>{previewName}</Text>
          <Text style={styles.previewText}>
            A identidade definida aqui acompanha a igreja em toda a experiência do Elo.
          </Text>
        </View>
      </View>

      <Text style={eloSharedStyles.sectionTitle}>Marca</Text>

      <EloCard>
        <BrandAssetEditor
          title="Logo da igreja"
          description="Disponível em todos os planos. Usada no cabeçalho e na identificação da igreja."
          imageUrl={displayLogo}
          onPick={() => void pickAsset("logo")}
          onRemove={() => {
            setSelectedLogo(null);
            setRemoveLogo(true);
          }}
        />

        <View style={styles.divider} />

        {canCustomIcon ? (
          <BrandAssetEditor
            title="Ícone do aplicativo"
            description="Usado na versão White Label. Prefira PNG quadrado 1024 × 1024."
            imageUrl={displayAppIcon}
            onPick={() => void pickAsset("app-icon")}
            onRemove={() => {
              setSelectedAppIcon(null);
              setRemoveAppIcon(true);
            }}
          />
        ) : (
          <PlanLockedFeature
            title="Ícone próprio do aplicativo"
            description="Disponível no Elo White Label e no Elo Rede."
          />
        )}

        <View style={styles.divider} />

        {canCustomSplash ? (
          <BrandAssetEditor
            title="Imagem de abertura"
            description="Aparece na abertura da experiência personalizada da igreja."
            imageUrl={displaySplash}
            onPick={() => void pickAsset("splash")}
            onRemove={() => {
              setSelectedSplash(null);
              setRemoveSplash(true);
            }}
          />
        ) : (
          <PlanLockedFeature
            title="Imagem de abertura personalizada"
            description="Disponível a partir do Elo Completo."
          />
        )}
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

        {canCustomAppName ? (
          <>
            <Text style={styles.label}>Nome exibido no aplicativo</Text>
            <TextInput
              value={appName}
              onChangeText={setAppName}
              placeholder="Ex.: ADVE"
              placeholderTextColor="#A1A9B0"
              autoCapitalize="words"
              maxLength={40}
              style={styles.input}
            />
            <Text style={styles.help}>
              Este será o nome usado no aplicativo White Label instalado.
            </Text>
          </>
        ) : (
          <View style={styles.lockedInline}>
            <PlanLockedFeature
              title="Nome próprio do aplicativo"
              description="No seu plano, o Elo usa o nome da igreja. Nome nativo próprio é recurso White Label."
            />
          </View>
        )}

        {canCustomColors ? (
          <>
            <Text style={styles.label}>Cor principal</Text>
            <View style={styles.colorGrid}>
              {COLOR_PRESETS.map((color) => {
                const selected = normalizedPrimary === color;

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

            <ColorInput
              label="Cor principal personalizada"
              value={primaryColor}
              onChange={setPrimaryColor}
              preview={normalizedPrimary}
            />
            <ColorInput
              label="Cor secundária"
              value={secondaryColor}
              onChange={setSecondaryColor}
              preview={normalizedSecondary}
            />
            <ColorInput
              label="Cor de fundo"
              value={backgroundColor}
              onChange={setBackgroundColor}
              preview={normalizedBackground}
            />
          </>
        ) : (
          <View style={styles.lockedInline}>
            <PlanLockedFeature
              title="Cores personalizadas"
              description="Disponível a partir do Elo Crescimento. O Essencial mantém a identidade padrão do Elo com a logo da igreja."
            />
          </View>
        )}
      </EloCard>

      <View style={styles.notice}>
        {activeOrganization.white_label_enabled ? (
          <P.SealCheckIcon
            size={20}
            color={previewPrimary}
            weight="duotone"
          />
        ) : (
          <P.InfoIcon size={20} color={eloColors.blue} weight="duotone" />
        )}
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>
            {activeOrganization.white_label_enabled
              ? "White Label ativado"
              : "Identidade dentro do Nethanel Elo"}
          </Text>
          <Text style={styles.noticeText}>
            {activeOrganization.white_label_enabled
              ? "Nome, ícone e imagem de abertura podem ser usados para gerar a versão exclusiva desta igreja."
              : "A igreja usa o aplicativo Nethanel Elo. Os recursos visuais disponíveis seguem automaticamente o plano contratado."}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <EloActionButton
          label="Salvar identidade"
          icon="CheckIcon"
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </EloScreen>
  );
}

function PlanLockedFeature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.lockedFeature}>
      <View style={styles.lockedFeatureIcon}>
        <P.LockKeyIcon size={19} color="#8A6B22" weight="duotone" />
      </View>
      <View style={styles.lockedFeatureCopy}>
        <Text style={styles.lockedFeatureTitle}>{title}</Text>
        <Text style={styles.lockedFeatureText}>{description}</Text>
      </View>
    </View>
  );
}

function BrandAssetEditor({
  title,
  description,
  imageUrl,
  onPick,
  onRemove,
}: {
  title: string;
  description: string;
  imageUrl: string | null;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <View>
      <View style={styles.logoRow}>
        <View style={styles.logoBox}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.logoImage} />
          ) : (
            <P.ImageIcon size={28} color={eloColors.muted} weight="duotone" />
          )}
        </View>
        <View style={styles.logoCopy}>
          <Text style={eloSharedStyles.cardTitle}>{title}</Text>
          <Text style={styles.help}>{description}</Text>
        </View>
      </View>

      <View style={styles.logoActions}>
        <View style={styles.flexButton}>
          <EloActionButton
            label={imageUrl ? "Trocar imagem" : "Escolher imagem"}
            icon="ImageIcon"
            variant="secondary"
            onPress={onPick}
          />
        </View>

        {imageUrl ? (
          <Pressable onPress={onRemove} style={styles.removeButton}>
            <P.TrashIcon
              size={18}
              color={eloColors.danger}
              weight="duotone"
            />
            <Text style={styles.removeText}>Remover</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ColorInput({
  label,
  value,
  onChange,
  preview,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  preview: string;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => onChange(sanitizeColorInput(next))}
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
            {
              backgroundColor: isValidColor(value) ? preview : eloColors.line,
            },
          ]}
        />
        <Text style={styles.colorPreviewText}>
          {isValidColor(value) ? preview : "Cor ainda incompleta"}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  planContextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderWidth: 1,
    borderColor: "#CFE4F1",
    borderRadius: 17,
    backgroundColor: "#F5FBFF",
  },
  planContextIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#E5F3FC",
  },
  planContextCopy: { flex: 1 },
  planContextEyebrow: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
    color: eloColors.blue,
  },
  planContextName: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  planContextText: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 16,
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: eloColors.line,
    borderRadius: 20,
  },
  previewLogo: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 18,
  },
  previewLogoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  previewCopy: { flex: 1 },
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
  logoCopy: { flex: 1 },
  help: {
    marginTop: 5,
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
  flexButton: { flex: 1 },
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
  divider: {
    height: 1,
    marginVertical: 18,
    backgroundColor: eloColors.line,
  },
  lockedInline: { marginTop: 14 },
  lockedFeature: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E8DDBF",
    borderRadius: 14,
    backgroundColor: "#FFFDF7",
  },
  lockedFeatureIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#FFF4D5",
  },
  lockedFeatureCopy: { flex: 1 },
  lockedFeatureTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.ink,
  },
  lockedFeatureText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
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
    borderWidth: 1,
    borderColor: eloColors.line,
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
  noticeCopy: { flex: 1 },
  noticeTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  noticeText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 17,
    color: "#557084",
  },
  footer: { marginTop: 22 },
});
