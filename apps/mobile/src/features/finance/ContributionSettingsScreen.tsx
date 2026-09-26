import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloCard,
  EloScreen,
  eloColors,
} from "../elo/EloUi";

type ContributionInfo = {
  enabled?: boolean;
  pix_key_type?: string | null;
  pix_key?: string | null;
  pix_copy_paste?: string | null;
  beneficiary_name?: string | null;
  bank_name?: string | null;
  instructions?: string | null;
};

const KEY_TYPES = [
  "CNPJ",
  "CPF",
  "EMAIL",
  "PHONE",
  "RANDOM",
  "COPY_PASTE",
] as const;

export function ContributionSettingsScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const { activeOrganization } = useOrganization();

  const [enabled, setEnabled] = useState(true);
  const [keyType, setKeyType] = useState("CNPJ");
  const [pixKey, setPixKey] = useState("");
  const [pixCopyPaste, setPixCopyPaste] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [bankName, setBankName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc(
      "get_contribution_settings_admin",
      {
        p_organization_id: activeOrganization.id,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      const info = (data ?? {}) as ContributionInfo;

      setEnabled(info.enabled ?? true);
      setKeyType(info.pix_key_type ?? "CNPJ");
      setPixKey(info.pix_key ?? "");
      setPixCopyPaste(info.pix_copy_paste ?? "");
      setBeneficiaryName(info.beneficiary_name ?? activeOrganization.name);
      setBankName(info.bank_name ?? "");
      setInstructions(info.instructions ?? "");
    }

    setLoading(false);
  }, [activeOrganization]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!activeOrganization) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const { error } = await supabase.rpc(
      "save_contribution_settings",
      {
        p_organization_id: activeOrganization.id,
        p_enabled: enabled,
        p_pix_key_type: keyType,
        p_pix_key: pixKey.trim() || null,
        p_pix_copy_paste: pixCopyPaste.trim() || null,
        p_beneficiary_name: beneficiaryName.trim() || null,
        p_bank_name: bankName.trim() || null,
        p_instructions: instructions.trim() || null,
      }
    );

    if (error) {
      setErrorMessage(error.message);
    } else {
      setMessage("Informações de contribuição atualizadas.");
    }

    setSaving(false);
  }

  return (
    <EloScreen
      title="Pix para membros"
      eyebrow="CONTRIBUIÇÕES"
      subtitle="Essas informações aparecem para o membro apenas como orientação. O Elo não processa o pagamento."
      onBack={onBack}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <EloCard>
            <View style={styles.enabledRow}>
              <View style={styles.flex}>
                <Text style={styles.title}>Exibir contribuição no app</Text>
                <Text style={styles.helper}>
                  Se estiver desativado, o membro verá que o Pix ainda não está disponível.
                </Text>
              </View>

              <Pressable
                onPress={() => setEnabled((current) => !current)}
                style={[
                  styles.toggle,
                  enabled && styles.toggleActive,
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    enabled && styles.toggleKnobActive,
                  ]}
                />
              </Pressable>
            </View>
          </EloCard>

          <EloCard style={styles.formCard}>
            <Text style={styles.label}>Tipo da chave</Text>

            <View style={styles.typeGrid}>
              {KEY_TYPES.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setKeyType(type)}
                  style={[
                    styles.typeButton,
                    keyType === type && styles.typeButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeText,
                      keyType === type && styles.typeTextActive,
                    ]}
                  >
                    {type === "RANDOM"
                      ? "Aleatória"
                      : type === "COPY_PASTE"
                        ? "Copia e cola"
                        : type}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Chave Pix</Text>
            <TextInput
              value={pixKey}
              onChangeText={setPixKey}
              placeholder="Informe a chave principal"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            <Text style={styles.label}>Pix copia e cola</Text>
            <TextInput
              value={pixCopyPaste}
              onChangeText={setPixCopyPaste}
              placeholder="Opcional"
              multiline
              textAlignVertical="top"
              style={styles.textArea}
            />

            <Text style={styles.label}>Nome do favorecido</Text>
            <TextInput
              value={beneficiaryName}
              onChangeText={setBeneficiaryName}
              placeholder="Nome exibido pelo banco"
              style={styles.input}
            />

            <Text style={styles.label}>Banco / instituição</Text>
            <TextInput
              value={bankName}
              onChangeText={setBankName}
              placeholder="Opcional"
              style={styles.input}
            />

            <Text style={styles.label}>Orientação ao membro</Text>
            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Ex.: confira o nome do favorecido antes de concluir."
              multiline
              textAlignVertical="top"
              style={styles.textArea}
            />

            {errorMessage ? (
              <Text style={styles.error}>{errorMessage}</Text>
            ) : null}

            {message ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{message}</Text>
              </View>
            ) : null}

            <EloActionButton
              label="Salvar informações"
              loading={saving}
              onPress={() => void save()}
              icon="FloppyDiskIcon"
            />
          </EloCard>
        </>
      )}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    paddingVertical: 70,
    alignItems: "center",
  },
  enabledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  title: {
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  helper: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.muted,
  },
  toggle: {
    width: 48,
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 3,
    borderRadius: 14,
    backgroundColor: "#D9DEE3",
  },
  toggleActive: {
    backgroundColor: eloColors.green,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  formCard: {
    marginTop: 10,
  },
  label: {
    marginTop: 14,
    marginBottom: 7,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  typeButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  typeButtonActive: {
    borderColor: eloColors.blue,
    backgroundColor: eloColors.surfaceSoft,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  typeTextActive: {
    color: eloColors.blue,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    fontSize: 13,
    color: eloColors.ink,
  },
  textArea: {
    minHeight: 88,
    padding: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    fontSize: 12,
    lineHeight: 18,
    color: eloColors.ink,
  },
  error: {
    marginTop: 12,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.danger,
  },
  successBox: {
    marginTop: 12,
    padding: 11,
    borderRadius: 12,
    backgroundColor: eloColors.successSoft,
  },
  successText: {
    fontSize: 11,
    fontWeight: "700",
    color: eloColors.green,
  },
});
