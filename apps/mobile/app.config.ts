import type { ConfigContext, ExpoConfig } from "expo/config";

function pluginName(plugin: NonNullable<ExpoConfig["plugins"]>[number]) {
  return typeof plugin === "string" ? plugin : plugin[0];
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const whiteLabel = process.env.ELO_WHITE_LABEL === "true";

  if (!whiteLabel) {
    return config as ExpoConfig;
  }

  const appName = process.env.ELO_APP_NAME?.trim() || config.name || "Nethanel Elo";
  const backgroundColor =
    process.env.ELO_BACKGROUND_COLOR?.trim() || "#F6F8FB";
  const brandColor = process.env.ELO_PRIMARY_COLOR?.trim() || "#2387C9";
  const brandLogoUrl = process.env.ELO_LOGO_URL?.trim() || null;
  const organizationId = process.env.ELO_ORGANIZATION_ID?.trim() || null;
  const brandedPush = process.env.ELO_BRANDED_PUSH === "true";
  const versionName = process.env.ELO_VERSION_NAME?.trim() || config.version || "1.0.0";
  const requestedCode = process.env.ELO_VERSION_CODE?.trim();
  const versionCode = requestedCode ? Number(requestedCode) : config.android?.versionCode;
  if (requestedCode && (!Number.isSafeInteger(versionCode) || !versionCode || versionCode < 1)) {
    throw new Error("ELO_VERSION_CODE invalido para APK white-label");
  }
  const appIconPath =
    process.env.ELO_APP_ICON_PATH || "./assets/white-label/icon.png";
  const adaptiveIconPath =
    process.env.ELO_ADAPTIVE_ICON_PATH ||
    "./assets/white-label/android-icon-foreground.png";
  const splashPath =
    process.env.ELO_SPLASH_PATH || "./assets/white-label/splash-icon.png";

  const defaultAndroidPackage =
    config.android?.package || "br.com.nethanel.church";
  const androidPackage =
    process.env.ELO_ANDROID_PACKAGE?.trim() || defaultAndroidPackage;
  const iosBundleIdentifier =
    process.env.ELO_IOS_BUNDLE_ID?.trim() ||
    config.ios?.bundleIdentifier ||
    "br.com.nethanel.church";

  const scheme =
    process.env.ELO_SCHEME?.trim() ||
    appName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ||
    "nethanelelo";

  const googleServicesFile =
    process.env.ELO_GOOGLE_SERVICES_FILE?.trim() ||
    (androidPackage === defaultAndroidPackage
      ? config.android?.googleServicesFile
      : undefined);

  const plugins = (config.plugins ?? []).filter(
    (plugin) => pluginName(plugin) !== "expo-splash-screen"
  );

  // Android exige um ícone monocromático e transparente na barra de notificações.
  // Esse arquivo é gerado por igreja no momento da compilação.
  if (brandedPush) {
    const oldNotifications = plugins.findIndex(
      (plugin) => pluginName(plugin) === "expo-notifications"
    );
    const configuredNotifications: NonNullable<ExpoConfig["plugins"]>[number] = [
      "expo-notifications",
      {
        defaultChannel: "elo-geral",
        icon: "./assets/white-label/notification-icon.png",
        color: /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : "#2387C9",
      },
    ];
    if (oldNotifications >= 0) plugins[oldNotifications] = configuredNotifications;
    else plugins.push(configuredNotifications);
  }

  plugins.push([
    "expo-splash-screen",
    {
      backgroundColor,
      image: splashPath,
      imageWidth: 220,
      resizeMode: "contain",
    },
  ]);

  return {
    ...(config as ExpoConfig),
    name: appName,
    version: versionName,
    // O runtime nunca deve ser compartilhado entre APKs personalizados.
    // OTA so sera habilitado apos isolamento completo de canal por igreja.
    runtimeVersion: organizationId
      ? `elo${organizationId.replace(/-/g, "")}-${versionName}`
      : versionName,
    icon: appIconPath,
    scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: iosBundleIdentifier,
      icon: appIconPath,
    },
    android: {
      ...config.android,
      package: androidPackage,
      ...(versionCode ? { versionCode } : {}),
      googleServicesFile,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        backgroundColor,
        foregroundImage: adaptiveIconPath,
      },
    },
    web: {
      ...config.web,
      favicon: appIconPath,
    },
    plugins,
    extra: {
      ...config.extra,
      whiteLabel: true,
      whiteLabelAppName: appName,
      whiteLabelAndroidPackage: androidPackage,
      whiteLabelVersionCode: versionCode ?? null,
      whiteLabelVersionName: versionName,
      whiteLabelScheme: scheme,
      eloOrganizationId: organizationId,
      eloBrandName: appName,
      eloBrandLogoUrl: brandLogoUrl,
      eloBrandColor: brandColor,
      eloBrandedPush: brandedPush,
    },
  };
};
