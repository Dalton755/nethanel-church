import AsyncStorage from "@react-native-async-storage/async-storage";
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
import * as WebBrowser from "expo-web-browser";

import { EloLogo } from "../../branding/EloBrand";
import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

const PENDING_JOIN_CODE_KEY =
  "@elo/pending-join-code";

const PENDING_ENTRY_INTENT_KEY =
  "@elo/pending-entry-intent";

const OAUTH_REDIRECT_URL =
  "nethanelelo://auth/callback";

type ScreenMode =
  | "home"
  | "join"
  | "email";

type EmailMode =
  | "login"
  | "signup";

function getUrlParameters(
  url: string
) {
  const result =
    new URLSearchParams();

  const queryIndex =
    url.indexOf("?");

  const hashIndex =
    url.indexOf("#");

  if (
    queryIndex >= 0
  ) {
    const queryEnd =
      hashIndex >= 0
        ? hashIndex
        : url.length;

    const queryParams =
      new URLSearchParams(
        url.slice(
          queryIndex + 1,
          queryEnd
        )
      );

    queryParams.forEach(
      (value, key) => {
        result.set(
          key,
          value
        );
      }
    );
  }

  if (
    hashIndex >= 0
  ) {
    const hashParams =
      new URLSearchParams(
        url.slice(
          hashIndex + 1
        )
      );

    hashParams.forEach(
      (value, key) => {
        result.set(
          key,
          value
        );
      }
    );
  }

  return result;
}

async function completeOAuthUrl(
  url: string
) {
  const params =
    getUrlParameters(
      url
    );

  const errorDescription =
    params.get(
      "error_description"
    );

  if (
    errorDescription
  ) {
    throw new Error(
      decodeURIComponent(
        errorDescription
      )
    );
  }

  const accessToken =
    params.get(
      "access_token"
    );

  const refreshToken =
    params.get(
      "refresh_token"
    );

  if (
    accessToken &&
    refreshToken
  ) {
    const {
      error,
    } =
      await supabase.auth.setSession({
        access_token:
          accessToken,

        refresh_token:
          refreshToken,
      });

    if (error) {
      throw error;
    }

    return;
  }

  const code =
    params.get(
      "code"
    );

  if (code) {
    const {
      error,
    } =
      await supabase.auth
        .exchangeCodeForSession(
          code
        );

    if (error) {
      throw error;
    }

    return;
  }

  throw new Error(
    "O Google não retornou uma sessão válida."
  );
}

export function AuthScreen() {
  const [
    screen,
    setScreen,
  ] =
    useState<ScreenMode>(
      "home"
    );

  const [
    emailMode,
    setEmailMode,
  ] =
    useState<EmailMode>(
      "login"
    );

  const [
    fullName,
    setFullName,
  ] =
    useState("");

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    churchCode,
    setChurchCode,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null
    );

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState<string | null>(
      null
    );

  function resetMessages() {
    setErrorMessage(
      null
    );

    setSuccessMessage(
      null
    );
  }

  function openScreen(
    next:
      ScreenMode
  ) {
    resetMessages();
    setScreen(
      next
    );
  }

  async function
    saveEntryIntent(
      intent:
        "join"
        | "create",
      code?: string
    ) {
      await AsyncStorage.setItem(
        PENDING_ENTRY_INTENT_KEY,
        intent
      );

      if (
        intent === "join" &&
        code
      ) {
        await AsyncStorage.setItem(
          PENDING_JOIN_CODE_KEY,
          code
        );
      }
    }

  async function
    handleGoogle(
      intent?:
        "join"
        | "create"
    ) {
      resetMessages();

      let normalizedCode =
        "";

      if (
        intent === "join"
      ) {
        normalizedCode =
          churchCode
            .trim()
            .toUpperCase();

        if (
          normalizedCode.length <
          4
        ) {
          setErrorMessage(
            "Digite o código da sua igreja."
          );

          return;
        }
      }

      setLoading(
        true
      );

      try {
        if (intent) {
          await saveEntryIntent(
            intent,
            normalizedCode
          );
        }

        const {
          data,
          error,
        } =
          await supabase.auth
            .signInWithOAuth({
              provider:
                "google",

              options: {
                redirectTo:
                  OAUTH_REDIRECT_URL,

                skipBrowserRedirect:
                  true,
              },
            });

        if (error) {
          throw error;
        }

        if (!data.url) {
          throw new Error(
            "Não foi possível iniciar o login com Google."
          );
        }

        const result =
          await WebBrowser
            .openAuthSessionAsync(
              data.url,
              OAUTH_REDIRECT_URL
            );

        if (
          result.type ===
          "success"
        ) {
          await completeOAuthUrl(
            result.url
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível entrar com Google.";

        setErrorMessage(
          message
        );
      } finally {
        setLoading(
          false
        );
      }
    }

  async function
    handleEmailSubmit() {
      resetMessages();

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      if (
        !normalizedEmail
      ) {
        setErrorMessage(
          "Informe seu e-mail."
        );

        return;
      }

      if (
        !password
      ) {
        setErrorMessage(
          "Informe sua senha."
        );

        return;
      }

      if (
        password.length <
        8
      ) {
        setErrorMessage(
          "A senha deve ter pelo menos 8 caracteres."
        );

        return;
      }

      if (
        emailMode ===
        "signup"
      ) {
        if (
          fullName
            .trim()
            .length <
          2
        ) {
          setErrorMessage(
            "Informe seu nome."
          );

          return;
        }

        if (
          password !==
          confirmPassword
        ) {
          setErrorMessage(
            "As senhas informadas não são iguais."
          );

          return;
        }
      }

      setLoading(
        true
      );

      try {
        if (
          emailMode ===
          "signup"
        ) {
          const {
            data,
            error,
          } =
            await supabase.auth
              .signUp({
                email:
                  normalizedEmail,

                password,

                options: {
                  emailRedirectTo:
                    "nethanelchurch://auth/confirm",

                  data: {
                    full_name:
                      fullName.trim(),
                  },
                },
              });

          if (error) {
            throw error;
          }

          if (
            !data.session
          ) {
            setSuccessMessage(
              "Conta criada. Confirme seu e-mail para continuar."
            );
          }

          return;
        }

        const {
          error,
        } =
          await supabase.auth
            .signInWithPassword({
              email:
                normalizedEmail,

              password,
            });

        if (error) {
          throw error;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível concluir o acesso.";

        setErrorMessage(
          message
        );
      } finally {
        setLoading(
          false
        );
      }
    }

  function renderMessage() {
    if (
      errorMessage
    ) {
      return (
        <View
          style={
            styles.errorBox
          }
        >
          <Text
            style={
              styles.errorText
            }
          >
            {errorMessage}
          </Text>
        </View>
      );
    }

    if (
      successMessage
    ) {
      return (
        <View
          style={
            styles.successBox
          }
        >
          <Text
            style={
              styles.successText
            }
          >
            {successMessage}
          </Text>
        </View>
      );
    }

    return null;
  }

  if (
    screen === "join"
  ) {
    return (
      <SafeAreaView
        style={
          styles.safeArea
        }
      >
        <KeyboardAvoidingView
          style={
            styles.flex
          }
          behavior={
            Platform.OS ===
            "ios"
              ? "padding"
              : undefined
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.scrollContent
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            <View
              style={
                styles.content
              }
            >
              <Pressable
                onPress={() =>
                  openScreen(
                    "home"
                  )
                }
                style={
                  styles.backButton
                }
              >
                <Text
                  style={
                    styles.backButtonText
                  }
                >
                  ← Voltar
                </Text>
              </Pressable>

              <EloLogo />

              <Text
                style={
                  styles.kicker
                }
              >
                ENTRAR NA MINHA IGREJA
              </Text>

              <Text
                style={
                  styles.title
                }
              >
                Um código. Só isso.
              </Text>

              <Text
                style={
                  styles.subtitle
                }
              >
                Digite o código compartilhado pela liderança. Ele ficará guardado durante o login.
              </Text>

              <View
                style={
                  styles.field
                }
              >
                <Text
                  style={
                    styles.label
                  }
                >
                  Código da igreja
                </Text>

                <TextInput
                  value={
                    churchCode
                  }
                  onChangeText={(
                    value
                  ) =>
                    setChurchCode(
                      value
                        .toUpperCase()
                        .replace(
                          /\s/g,
                          ""
                        )
                    )
                  }
                  placeholder="Ex.: ELO2026"
                  autoCapitalize="characters"
                  autoCorrect={
                    false
                  }
                  maxLength={
                    24
                  }
                  style={
                    styles.input
                  }
                />
              </View>

              {renderMessage()}

              <View
                style={
                  styles.savedCodeBox
                }
              >
                <Text
                  style={
                    styles.savedCodeIcon
                  }
                >
                  🔐
                </Text>

                <View
                  style={
                    styles.savedCodeCopy
                  }
                >
                  <Text
                    style={
                      styles.savedCodeTitle
                    }
                  >
                    Seu código fica guardado
                  </Text>

                  <Text
                    style={
                      styles.savedCodeText
                    }
                  >
                    Entre com Google e o Elo volta direto para confirmar esta igreja.
                  </Text>
                </View>
              </View>

              <GoogleButton
                loading={
                  loading
                }
                onPress={() => {
                  void handleGoogle(
                    "join"
                  );
                }}
              />

              <Text
                style={
                  styles.fine
                }
              >
                Se a secretaria já tiver seu cadastro com o mesmo e-mail, o Elo reaproveita essa pessoa em vez de duplicar.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (
    screen === "email"
  ) {
    const isSignup =
      emailMode ===
      "signup";

    return (
      <SafeAreaView
        style={
          styles.safeArea
        }
      >
        <KeyboardAvoidingView
          style={
            styles.flex
          }
          behavior={
            Platform.OS ===
            "ios"
              ? "padding"
              : undefined
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.scrollContent
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            <View
              style={
                styles.content
              }
            >
              <Pressable
                onPress={() =>
                  openScreen(
                    "home"
                  )
                }
                style={
                  styles.backButton
                }
              >
                <Text
                  style={
                    styles.backButtonText
                  }
                >
                  ← Voltar
                </Text>
              </Pressable>

              <EloLogo />

              <Text
                style={
                  styles.kicker
                }
              >
                ACESSO POR E-MAIL
              </Text>

              <Text
                style={
                  styles.title
                }
              >
                {isSignup
                  ? "Crie sua conta"
                  : "Entre no Elo"}
              </Text>

              <Text
                style={
                  styles.subtitle
                }
              >
                O Google continua sendo o acesso mais simples. Esta opção fica disponível como alternativa.
              </Text>

              <View
                style={
                  styles.form
                }
              >
                {isSignup && (
                  <View
                    style={
                      styles.field
                    }
                  >
                    <Text
                      style={
                        styles.label
                      }
                    >
                      Nome
                    </Text>

                    <TextInput
                      value={
                        fullName
                      }
                      onChangeText={
                        setFullName
                      }
                      placeholder="Seu nome"
                      autoCapitalize="words"
                      style={
                        styles.input
                      }
                    />
                  </View>
                )}

                <View
                  style={
                    styles.field
                  }
                >
                  <Text
                    style={
                      styles.label
                    }
                  >
                    E-mail
                  </Text>

                  <TextInput
                    value={
                      email
                    }
                    onChangeText={
                      setEmail
                    }
                    placeholder="voce@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={
                      false
                    }
                    style={
                      styles.input
                    }
                  />
                </View>

                <View
                  style={
                    styles.field
                  }
                >
                  <Text
                    style={
                      styles.label
                    }
                  >
                    Senha
                  </Text>

                  <TextInput
                    value={
                      password
                    }
                    onChangeText={
                      setPassword
                    }
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    style={
                      styles.input
                    }
                  />
                </View>

                {isSignup && (
                  <View
                    style={
                      styles.field
                    }
                  >
                    <Text
                      style={
                        styles.label
                      }
                    >
                      Confirmar senha
                    </Text>

                    <TextInput
                      value={
                        confirmPassword
                      }
                      onChangeText={
                        setConfirmPassword
                      }
                      placeholder="••••••••"
                      secureTextEntry
                      autoCapitalize="none"
                      style={
                        styles.input
                      }
                    />
                  </View>
                )}

                {renderMessage()}

                <Pressable
                  onPress={() => {
                    void handleEmailSubmit();
                  }}
                  disabled={
                    loading
                  }
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed &&
                      !loading &&
                      styles.pressed,
                    loading &&
                      styles.disabled,
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator
                      color="#ffffff"
                    />
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
                  onPress={() => {
                    resetMessages();

                    setEmailMode(
                      isSignup
                        ? "login"
                        : "signup"
                    );
                  }}
                  disabled={
                    loading
                  }
                  style={
                    styles.textButton
                  }
                >
                  <Text
                    style={
                      styles.textButtonText
                    }
                  >
                    {isSignup
                      ? "Já tenho uma conta"
                      : "Criar conta com e-mail"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
    >
      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View
          style={
            styles.content
          }
        >
          <View
            style={
              styles.logoCenter
            }
          >
            <EloLogo />
          </View>

          <Text
            style={
              styles.kicker
            }
          >
            NETHANEL TECNOLOGIA
          </Text>

          <Text
            style={
              styles.homeTitle
            }
          >
            Sua igreja conectada de um jeito simples.
          </Text>

          <Text
            style={
              styles.subtitle
            }
          >
            Pessoas, ministérios, agenda e comunidade no mesmo Elo.
          </Text>

          {renderMessage()}

          <GoogleButton
            loading={
              loading
            }
            onPress={() => {
              void handleGoogle();
            }}
          />

          <Pressable
            onPress={() =>
              openScreen(
                "email"
              )
            }
            disabled={
              loading
            }
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.secondaryButtonIcon
              }
            >
              ✉
            </Text>

            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Entrar com e-mail
            </Text>
          </Pressable>

          <View
            style={
              styles.divider
            }
          />

          <Pressable
            onPress={() =>
              openScreen(
                "join"
              )
            }
            disabled={
              loading
            }
            style={
              styles.linkButton
            }
          >
            <Text
              style={
                styles.linkButtonText
              }
            >
              Já tenho o código da minha igreja
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void handleGoogle(
                "create"
              );
            }}
            disabled={
              loading
            }
            style={
              styles.linkButton
            }
          >
            <Text
              style={
                styles.linkButtonText
              }
            >
              Criar uma igreja
            </Text>
          </Pressable>

          <Text
            style={
              styles.fine
            }
          >
            Sem cartão, CNPJ ou qualquer dado fiscal no primeiro acesso.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type GoogleButtonProps = {
  loading: boolean;
  onPress: () => void;
};

function GoogleButton({
  loading,
  onPress,
}: GoogleButtonProps) {
  return (
    <Pressable
      onPress={
        onPress
      }
      disabled={
        loading
      }
      style={({ pressed }) => [
        styles.googleButton,
        pressed &&
          !loading &&
          styles.pressed,
        loading &&
          styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color="#ffffff"
        />
      ) : (
        <>
          <View
            style={
              styles.googleMark
            }
          >
            <Text
              style={
                styles.googleMarkText
              }
            >
              G
            </Text>
          </View>

          <Text
            style={
              styles.googleButtonText
            }
          >
            Continuar com Google
          </Text>

          <Text
            style={
              styles.googleArrow
            }
          >
            →
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles =
  StyleSheet.create({
    flex: {
      flex: 1,
    },

    safeArea: {
      flex: 1,
      backgroundColor:
        "#f7f9fc",
    },

    scrollContent: {
      flexGrow: 1,
      justifyContent:
        "center",
    },

    content: {
      width: "100%",
      maxWidth: 520,
      alignSelf:
        "center",
      paddingHorizontal:
        24,
      paddingVertical:
        32,
    },

    logoCenter: {
      alignItems:
        "center",
      marginBottom:
        8,
    },

    kicker: {
      marginTop: 8,
      marginBottom:
        10,
      fontSize: 11,
      fontWeight:
        "800",
      letterSpacing:
        1.5,
      color:
        "#69717d",
    },

    homeTitle: {
      maxWidth: 420,
      fontSize: 31,
      lineHeight: 37,
      fontWeight:
        "800",
      color:
        "#17191c",
    },

    title: {
      marginTop: 5,
      fontSize: 30,
      lineHeight: 36,
      fontWeight:
        "800",
      color:
        "#17191c",
    },

    subtitle: {
      marginTop: 10,
      marginBottom:
        26,
      fontSize: 15,
      lineHeight: 22,
      color:
        "#6b717a",
    },

    form: {
      gap: 18,
    },

    field: {
      gap: 7,
      marginBottom:
        18,
    },

    label: {
      fontSize: 14,
      fontWeight:
        "700",
      color:
        "#292d32",
    },

    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor:
        "#dfe3e8",
      borderRadius: 14,
      paddingHorizontal:
        15,
      fontSize: 16,
      color:
        "#17191c",
      backgroundColor:
        "#ffffff",
    },

    googleButton: {
      minHeight: 54,
      flexDirection:
        "row",
      alignItems:
        "center",
      paddingHorizontal:
        16,
      borderRadius: 15,
      backgroundColor:
        "#17191c",
    },

    googleMark: {
      width: 30,
      height: 30,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 15,
      backgroundColor:
        "#ffffff",
    },

    googleMarkText: {
      fontSize: 16,
      fontWeight:
        "900",
      color:
        "#4285f4",
    },

    googleButtonText: {
      flex: 1,
      marginLeft: 12,
      fontSize: 15,
      fontWeight:
        "800",
      color:
        "#ffffff",
      textAlign:
        "center",
    },

    googleArrow: {
      fontSize: 20,
      color:
        "#ffffff",
    },

    secondaryButton: {
      minHeight: 52,
      marginTop: 10,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 9,
      borderWidth: 1,
      borderColor:
        "#dfe3e8",
      borderRadius: 15,
      backgroundColor:
        "#ffffff",
    },

    secondaryButtonIcon: {
      fontSize: 16,
    },

    secondaryButtonText: {
      fontSize: 15,
      fontWeight:
        "700",
      color:
        "#34383e",
    },

    divider: {
      height: 1,
      marginVertical:
        22,
      backgroundColor:
        "#e6e9ed",
    },

    linkButton: {
      minHeight: 44,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    linkButtonText: {
      fontSize: 14,
      fontWeight:
        "700",
      color:
        "#3d4652",
    },

    fine: {
      marginTop: 18,
      fontSize: 12,
      lineHeight: 18,
      textAlign:
        "center",
      color:
        "#8a9098",
    },

    backButton: {
      alignSelf:
        "flex-start",
      minHeight: 42,
      justifyContent:
        "center",
      marginBottom: 8,
    },

    backButtonText: {
      fontSize: 14,
      fontWeight:
        "700",
      color:
        "#4f5660",
    },

    savedCodeBox: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 11,
      marginBottom: 12,
      padding: 13,
      borderRadius: 15,
      backgroundColor:
        "#eef5fa",
    },

    savedCodeIcon: {
      fontSize: 20,
    },

    savedCodeCopy: {
      flex: 1,
    },

    savedCodeTitle: {
      fontSize: 13,
      fontWeight:
        "800",
      color:
        "#303841",
    },

    savedCodeText: {
      marginTop: 3,
      fontSize: 11,
      lineHeight: 16,
      color:
        "#6f7882",
    },

    primaryButton: {
      minHeight: 52,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 14,
      backgroundColor:
        "#17191c",
    },

    primaryButtonText: {
      fontSize: 15,
      fontWeight:
        "800",
      color:
        "#ffffff",
    },

    textButton: {
      minHeight: 44,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    textButtonText: {
      fontSize: 14,
      fontWeight:
        "700",
      color:
        "#4b535d",
    },

    errorBox: {
      marginBottom: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor:
        "#fff1f1",
    },

    errorText: {
      fontSize: 13,
      lineHeight: 19,
      color:
        "#8b1e1e",
    },

    successBox: {
      marginBottom: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor:
        "#eef8f1",
    },

    successText: {
      fontSize: 13,
      lineHeight: 19,
      color:
        "#28613a",
    },

    pressed: {
      opacity: 0.78,
    },

    disabled: {
      opacity: 0.55,
    },
  });
