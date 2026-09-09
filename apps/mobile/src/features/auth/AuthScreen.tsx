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

type AuthMode = "login" | "signup";

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage(null);
    setSuccessMessage(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit() {
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      setErrorMessage("Informe seu e-mail.");
      return;
    }

    if (!password) {
      setErrorMessage("Informe sua senha.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage(
        "A senha deve ter pelo menos 8 caracteres."
      );
      return;
    }

    if (mode === "signup") {
      if (fullName.trim().length < 2) {
        setErrorMessage("Informe seu nome.");
        return;
      }

      if (password !== confirmPassword) {
        setErrorMessage(
          "As senhas informadas não são iguais."
        );
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const {
          data,
          error,
        } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          setSuccessMessage(
            "Conta criada. Confirme seu e-mail para continuar."
          );
        }

        return;
      }

      const { error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) {
        throw error;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a autenticação.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";

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
            <View style={styles.header}>
              <Text style={styles.brand}>
                NETHANEL CHURCH
              </Text>

              <Text style={styles.title}>
                {isSignup
                  ? "Crie sua conta"
                  : "Bem-vindo"}
              </Text>

              <Text style={styles.subtitle}>
                {isSignup
                  ? "Comece com seus dados pessoais. A igreja será configurada depois."
                  : "Entre para acessar sua igreja e continuar de onde parou."}
              </Text>
            </View>

            <View style={styles.form}>
              {isSignup && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Nome
                  </Text>

                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Seu nome"
                    autoCapitalize="words"
                    autoComplete="name"
                    style={styles.input}
                  />
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>
                  E-mail
                </Text>

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="voce@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Senha
                </Text>

                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={
                    isSignup
                      ? "new-password"
                      : "current-password"
                  }
                  style={styles.input}
                />
              </View>

              {isSignup && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Confirmar senha
                  </Text>

                  <TextInput
                    value={confirmPassword}
                    onChangeText={
                      setConfirmPassword
                    }
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    style={styles.input}
                  />
                </View>
              )}

              {errorMessage && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    {errorMessage}
                  </Text>
                </View>
              )}

              {successMessage && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>
                    {successMessage}
                  </Text>
                </View>
              )}

              <Pressable
                onPress={handleSubmit}
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
                    {isSignup
                      ? "Criar conta"
                      : "Entrar"}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() =>
                  changeMode(
                    isSignup
                      ? "login"
                      : "signup"
                  )
                }
                disabled={loading}
                style={styles.secondaryButton}
              >
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  {isSignup
                    ? "Já tenho uma conta"
                    : "Criar uma conta"}
                </Text>
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

  header: {
    marginBottom: 32,
  },

  brand: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.4,
    marginBottom: 18,
    color: "#262626",
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
  },

  form: {
    gap: 18,
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

  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: "#171717",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },

  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333333",
  },

  buttonPressed: {
    opacity: 0.82,
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  errorBox: {
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff1f1",
  },

  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#8b1e1e",
  },

  successBox: {
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#eef7ef",
  },

  successText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#245b2d",
  },
});