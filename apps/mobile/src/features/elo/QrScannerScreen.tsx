import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Phosphor from "phosphor-react-native";

import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloScreen,
  eloColors,
} from "./EloUi";

const P = Phosphor as any;

type RedeemResult = {
  ok?: boolean;
  kind?: string;
  error?: string;
  event_title?: string;
  person_name?: string;
  child_name?: string;
  room_name?: string;
  department_name?: string;
};

export function QrScannerScreen({ onBack }: { onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);

  async function redeem(payload: string) {
    if (locked || working) return;

    setLocked(true);
    setWorking(true);
    setResult(null);

    try {
      const { data, error } = await supabase.rpc("redeem_elo_qr", {
        p_payload: payload,
      });

      if (error) throw error;

      const next = (data ?? {}) as RedeemResult;
      setResult(next);

      if (!next.ok) {
        Alert.alert("QR não validado", next.error || "QR inválido ou expirado.");
      }
    } catch (error) {
      Alert.alert(
        "Não foi possível validar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorking(false);
    }
  }

  if (!permission) {
    return (
      <EloScreen title="Leitor QR" eyebrow="ELO • CHECK-IN" onBack={onBack}>
        <View style={styles.loading}><ActivityIndicator /></View>
      </EloScreen>
    );
  }

  if (!permission.granted) {
    return (
      <EloScreen
        title="Leitor QR"
        eyebrow="ELO • CHECK-IN"
        subtitle="A câmera é usada apenas para validar códigos QR do Elo."
        onBack={onBack}
      >
        <View style={styles.permissionBox}>
          <View style={styles.permissionIcon}>
            <P.CameraIcon size={25} color={eloColors.blue} weight="duotone" />
          </View>
          <Text style={styles.permissionTitle}>Permita o uso da câmera</Text>
          <Text style={styles.permissionText}>
            Precisamos dela para ler QR de escalas, eventos e Elo Kids.
          </Text>
          <EloActionButton
            label="Permitir câmera"
            icon="CameraIcon"
            onPress={() => void requestPermission()}
          />
        </View>
      </EloScreen>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          locked
            ? undefined
            : ({ data }) => {
                void redeem(data);
              }
        }
      />

      <View style={styles.overlay}>
        <View style={styles.top}>
          <Pressable onPress={onBack} style={styles.closeButton}>
            <P.XIcon size={21} color="#FFFFFF" weight="bold" />
          </Pressable>
          <Text style={styles.topTitle}>Leitor QR do Elo</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.scanArea}>
          <View style={styles.frame} />
          <Text style={styles.hint}>
            Aponte para um QR de escala, evento ou Elo Kids.
          </Text>
        </View>

        <View style={styles.bottomSheet}>
          {working ? (
            <View style={styles.resultRow}>
              <ActivityIndicator />
              <Text style={styles.resultText}>Validando...</Text>
            </View>
          ) : result?.ok ? (
            <>
              <View style={styles.successRow}>
                <P.CheckCircleIcon size={24} color={eloColors.green} weight="fill" />
                <View style={styles.successCopy}>
                  <Text style={styles.successTitle}>QR validado</Text>
                  <Text style={styles.resultText}>
                    {result.child_name ||
                      result.person_name ||
                      result.event_title ||
                      result.department_name ||
                      result.kind ||
                      "Check-in concluído"}
                  </Text>
                </View>
              </View>

              <EloActionButton
                label="Ler próximo QR"
                onPress={() => {
                  setResult(null);
                  setLocked(false);
                }}
              />
            </>
          ) : (
            <Text style={styles.readyText}>Pronto para ler</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  loading: {
    paddingVertical: 60,
    alignItems: "center",
  },
  permissionBox: {
    marginTop: 30,
    alignItems: "center",
    padding: 22,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
  },
  permissionIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: eloColors.surfaceSoft,
  },
  permissionTitle: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: "900",
    color: eloColors.ink,
  },
  permissionText: {
    marginTop: 7,
    marginBottom: 18,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: eloColors.muted,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  top: {
    paddingTop: 52,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  placeholder: {
    width: 44,
  },
  scanArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  frame: {
    width: 245,
    height: 245,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderRadius: 28,
  },
  hint: {
    marginTop: 18,
    maxWidth: 300,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: "#FFFFFF",
  },
  bottomSheet: {
    minHeight: 145,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultText: {
    fontSize: 13,
    color: eloColors.muted,
  },
  successRow: {
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  successCopy: {
    flex: 1,
  },
  successTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: eloColors.ink,
  },
  readyText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: eloColors.muted,
  },
});
