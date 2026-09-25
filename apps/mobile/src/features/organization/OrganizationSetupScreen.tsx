import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";

type OrganizationSetupScreenProps = {
  displayName?: string | null;
  onCreated: () => Promise<void>;
};

export function OrganizationSetupScreen({
  displayName,
  onCreated,
}: OrganizationSetupScreenProps) {
  const [churchName, setChurchName] = useState("");
  const [unitName, setUnitName] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  async function handleCreateOrganization() {
    setErrorMessage(null);

    const normalizedChurchName =
      churchName.trim();

    const normalizedUnitName =
      unitName.trim();

    if (normalizedChurchName.length < 2) {
      setErrorMessage(
        "Informe o nome da igreja."
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.rpc(
        "create_organization",
        {
          p_name: normalizedChurchName,
          p_unit_name:
            normalizedUnitName || null,
          p_slug: null,
        }
      );

      if (error) {
        throw error;
      }

      await onCreated();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível criar a igreja.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.scrollContent
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <Text style={styles.brand}>
              NETHANEL ELO
            </Text>

            <Text style={styles.eyebrow}>
              {displayName
                ? `Olá, ${displayName}`
                : "Primeiros passos"}
            </Text>

            <Text style={styles.title}>
              Configure sua igreja
            </Text>

            <Text style={styles.subtitle}>
              Vamos começar somente com o
              essencial. Os demais dados poderão
              ser preenchidos depois.
            </Text>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>
                  Nome da igreja
                </Text>

                <TextInput
                  value={churchName}
                  onChangeText={setChurchName}
                  placeholder="Ex.: Assembleia de Deus Central"
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Nome da sede
                </Text>

                <TextInput
                  value={unitName}
                  onChangeText={setUnitName}
                  placeholder="Opcional"
                  autoCapitalize="words"
                  style={styles.input}
                />

                <Text style={styles.helper}>
                  Se deixar vazio, usaremos o
                  próprio nome da igreja.
                </Text>
              </View>

              {errorMessage && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    {errorMessage}
                  </Text>
                </View>
              )}

              <Pressable
                onPress={
                  handleCreateOrganization
                }
                disabled={loading}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed &&
                    !loading &&
                    styles.buttonPressed,
                  loading &&
                    styles.buttonDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator />
                ) : (
                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    Criar minha igreja
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f6",
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  content: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },

  brand: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.4,
    color: "#242424",
    marginBottom: 28,
  },

  eyebrow: {
    fontSize: 14,
    fontWeight: "600",
    color: "#676767",
    marginBottom: 8,
  },

  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#626262",
    marginBottom: 32,
  },

  form: {
    gap: 20,
  },

  field: {
    gap: 7,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#282828",
  },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#ddddda",
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    color: "#111111",
    backgroundColor: "#ffffff",
  },

  helper: {
    fontSize: 12,
    lineHeight: 17,
    color: "#777777",
  },

  primaryButton: {
    minHeight: 52,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "#171717",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },

  buttonPressed: {
    opacity: 0.82,
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  errorBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fff1f1",
  },

  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#8b1e1e",
  },
});