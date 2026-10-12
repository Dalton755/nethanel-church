import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
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
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
  // Versao do manifest Android efetivamente instalado, nao do bundle OTA.
  // Futura migracao para Application.nativeBuildVersion (expo-application).
  const installedCode = Constants.platform?.android?.versionCode;

  useEffect(() => {
    if (Platform.OS !== "android" || !organizationId || !installedOrg ||
        installedOrg !== organizationId || !androidPackage ||
        !Number.isInteger(installedCode) || (installedCode ?? 0) <= 0) return;

    let mounted = true;
    async function checkUpdate() {
      const now = Date.now();
      if (now - lastCheck.current < CHECK_INTERVAL_MS) return;
      lastCheck.current = now;
      const { data, error } = await supabase.rpc("get_church_app_update", {
        p_organization_id: organizationId,
        p_android_package: androidPackage,
        p_installed_version_code: installedCode,
      });
      if (!mounted || error) return;
      const value = data as AvailableUpdate | { available: false } | null;
      if (value?.available && Number.isInteger(value.version_code) &&
          typeof value.artifact_path === "string") {
        setUpdate(value);
        setDismissed(false);
      }
    }

    void checkUpdate();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkUpdate();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [organizationId, installedOrg, androidPackage, installedCode]);

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
