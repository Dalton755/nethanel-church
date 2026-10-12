import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  DeviceEventEmitter,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";

type AvailableUpdate = {
  available: true;
  version_name: string;
  version_code: number;
  mandatory: boolean;
  release_notes: string;
  artifact_path: string;
};

const BUCKET = "elo-church-apks";
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEMO_CHECK_INTERVAL_MS = 60 * 1000;

function safeBuildCode(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) && value > 0
    ? value : null;
}

/** Nenhuma consulta e feita por apps genericos ou pelo APK de OUTRA igreja. */
export function ChurchApkUpdatePrompt() {
  const { activeOrganization } = useOrganization();
  const lastCheck = useRef(0);
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const organizationId = activeOrganization?.id;
  const config = Constants.expoConfig?.extra;
  const installedOrg = typeof config?.eloOrganizationId === "string"
    ? config.eloOrganizationId : null;
  const androidPackage = typeof config?.whiteLabelAndroidPackage === "string"
    ? config.whiteLabelAndroidPackage : null;
  // No Android Expo SDK 57, Constants.platform?.android?.versionCode pode
  // ficar ausente em builds EAS. O versionCode tambem e fixado na config
  // white-label embutida no proprio APK (nunca vem do servidor/OTA).
  const installedCode =
    safeBuildCode(Constants.platform?.android?.versionCode) ??
    safeBuildCode(config?.whiteLabelVersionCode);
  const isWhiteLabelChurch = Platform.OS === "android" &&
    typeof organizationId === "string" &&
    installedOrg === organizationId &&
    typeof androidPackage === "string" &&
    androidPackage === `br.com.nethanel.elo.c${organizationId.replace(/-/g, "")}`;
  const demoMode = organizationId === "101212c5-6e81-4915-ae9a-fbde5b42bb04";

  useEffect(() => {
    let mounted = true;

    async function checkUpdate(force = false) {
      if (!isWhiteLabelChurch || !organizationId || !androidPackage || !installedCode) {
        if (force) {
          Alert.alert("Atualizações indisponíveis",
            "Não foi possível reconhecer a identidade ou versão deste aplicativo da igreja.");
        }
        return;
      }

      const now = Date.now();
      const interval = demoMode ? DEMO_CHECK_INTERVAL_MS : CHECK_INTERVAL_MS;
      if (!force && now - lastCheck.current < interval) return;
      lastCheck.current = now;

      try {
        // Telemetria por conta autenticada: apenas versao informada pelo APK
      // da propria igreja. A falha desta consulta nao bloqueia atualizacoes.
      void supabase.rpc("report_church_app_version", {
        p_organization_id: organizationId,
        p_android_package: androidPackage,
        p_version_code: installedCode,
      });

      const { data, error } = await supabase.rpc("get_church_app_update", {
          p_organization_id: organizationId,
          p_android_package: androidPackage,
          p_installed_version_code: installedCode,
        });
        if (!mounted) return;
        if (error) throw error;

        const value = data as AvailableUpdate | { available: false } | null;
        if (value?.available && Number.isInteger(value.version_code) &&
            typeof value.artifact_path === "string") {
          setUpdate(value);
          setDismissed(false);
        } else {
          setUpdate(null);
          if (force) {
            Alert.alert("Aplicativo atualizado",
              "Você já está utilizando a versão mais recente disponível para sua igreja.");
          }
        }
      } catch (error) {
        lastCheck.current = 0; // Falhas podem ser verificadas novamente.
        console.warn("Elo: falha ao consultar atualizações", error);
        if (force && mounted) {
          Alert.alert("Não foi possível verificar",
            "Confira sua conexão e entre novamente em Perfil > Verificar atualizações.");
        }
      }
    }

    void checkUpdate();
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkUpdate();
    });
    const manualCheckSub = DeviceEventEmitter.addListener(
      "elo:check-church-update", () => void checkUpdate(true),
    );

    return () => {
      mounted = false;
      appStateSub.remove();
      manualCheckSub.remove();
    };
  }, [organizationId, androidPackage, installedCode, isWhiteLabelChurch, demoMode]);

  async function openDownload() {
    if (!update || downloading) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(update.artifact_path, 900);
      if (error || !data?.signedUrl) {
        throw error ?? new Error("Nao foi possivel obter o arquivo.");
      }
      await Linking.openURL(data.signedUrl);
      // O Android solicita confirmacao para a instalacao; nao instalamos
      // silenciosamente e nao apagamos o app ou dados existentes.
    } catch {
      Alert.alert("Nao foi possivel baixar",
        "Confira sua conexao e tente novamente. Seus dados estao seguros.");
    } finally {
      setDownloading(false);
    }
  }

  if (!update || dismissed) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => { if (!update.mandatory) setDismissed(true); }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>NETHANEL ELO • ATUALIZACAO</Text>
          <Text style={styles.title}>Nova versão disponível</Text>
          <Text style={styles.body}>
            A versão {update.version_name} do aplicativo da sua igreja já pode ser instalada.
          </Text>
          {Boolean(update.release_notes) && (
            <Text style={styles.notes}>{update.release_notes}</Text>
          )}
          {update.mandatory && (
            <Text style={styles.mandatory}>Atualização necessária para continuar usando esta versão.</Text>
          )}
          <Pressable
            accessibilityRole="button"
            style={[styles.primary, downloading && styles.disabled]}
            disabled={downloading}
            onPress={() => void openDownload()}
          >
            {downloading ? <ActivityIndicator color="#fff" /> :
              <Text style={styles.primaryText}>Abrir download seguro</Text>}
          </Pressable>
          {!update.mandatory && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setDismissed(true)}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Agora não</Text>
            </Pressable>
          )}
          <Text style={styles.footer}>
            O Android pedirá sua confirmação para instalar. Não desinstale a versão atual.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 24,
    backgroundColor: "rgba(12,21,33,0.66)" },
  card: { backgroundColor: "#fff", borderRadius: 22, padding: 24 },
  eyebrow: { color: "#6B7280", fontSize: 11, letterSpacing: 1.2,
    fontWeight: "700", marginBottom: 10 },
  title: { color: "#142A37", fontSize: 23, fontWeight: "800", marginBottom: 12 },
  body: { color: "#4B5563", fontSize: 15, lineHeight: 22 },
  notes: { marginTop: 12, padding: 12, backgroundColor: "#F5F8FA",
    borderRadius: 12, color: "#334155", lineHeight: 20 },
  mandatory: { marginTop: 12, color: "#9A3412", fontWeight: "600" },
  primary: { marginTop: 20, borderRadius: 12, minHeight: 49,
    alignItems: "center", justifyContent: "center", backgroundColor: "#2387C9" },
  disabled: { opacity: 0.55 },
  primaryText: { color: "white", fontWeight: "700", fontSize: 15 },
  secondary: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  secondaryText: { color: "#475569", fontWeight: "600" },
  footer: { marginTop: 13, color: "#64748B", fontSize: 12, lineHeight: 18 },
});
