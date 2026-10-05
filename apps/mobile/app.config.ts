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
      whiteLabelScheme: scheme,
    },
  };
};
