import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useEffect,
  useState,
} from "react";
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

import { EloLogo } from "../../branding/EloBrand";
import { supabase } from "../../lib/supabase";
import { OrganizationSetupScreen } from "./OrganizationSetupScreen";

const PENDING_JOIN_CODE_KEY =
  "@elo/pending-join-code";

const PENDING_ENTRY_INTENT_KEY =
  "@elo/pending-entry-intent";

type EntryMode =
  | "choices"
  | "join"
  | "create";

type OrganizationLookup = {
  organization_id:
    string;

  name: string;

  city:
    string | null;

  state:
    string | null;
};

type OrganizationEntryScreenProps = {
  displayName?:
    string | null;

  onChanged:
    () => Promise<void>;
};

export function OrganizationEntryScreen({
  displayName,
  onChanged,
}: OrganizationEntryScreenProps) {
  const [
    mode,
    setMode,
  ] =
    useState<EntryMode>(
      "choices"
    );

  const [
    code,
    setCode,
  ] =
    useState("");

  const [
    church,
    setChurch,
  ] =
    useState<OrganizationLookup | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    initializing,
    setInitializing,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null
    );

  useEffect(() => {
    let mounted =
      true;

    async function
      loadPendingEntry() {
        try {
          const [
            pendingCode,
            pendingIntent,
          ] =
            await Promise.all([
              AsyncStorage.getItem(
                PENDING_JOIN_CODE_KEY
              ),

              AsyncStorage.getItem(
                PENDING_ENTRY_INTENT_KEY
              ),
            ]);

          if (!mounted) {
            return;
          }

          if (
            pendingCode
          ) {
            setCode(
              pendingCode
            );

            setMode(
              "join"
            );

            return;
          }

          if (
            pendingIntent ===
            "create"
          ) {
            setMode(
              "create"
            );
          }
        } finally {
          if (
            mounted
          ) {
            setInitializing(
              false
            );
          }
        }
      }

    void loadPendingEntry();

    return () => {
      mounted =
        false;
    };
  }, []);

  function
    normalizeCode(
      value: string
    ) {
      return value
        .trim()
        .toUpperCase()
        .replace(
          /\s/g,
          ""
        );
    }

  async function
    clearPendingEntry() {
      await Promise.all([
        AsyncStorage.removeItem(
          PENDING_JOIN_CODE_KEY
        ),

        AsyncStorage.removeItem(
          PENDING_ENTRY_INTENT_KEY
        ),
      ]);
    }

  async function
    handleVerify() {
      setErrorMessage(
        null
      );

      setChurch(
        null
      );

      const normalized =
        normalizeCode(
          code
        );

      if (
        normalized.length <
        4
      ) {
        setErrorMessage(
          "Digite o código da sua igreja."
        );

        return;
      }

      setCode(
        normalized
      );

      setLoading(
        true
      );

      try {
        await AsyncStorage.setItem(
          PENDING_JOIN_CODE_KEY,
          normalized
        );

        const {
          data,
          error,
        } =
          await supabase.rpc(
            "lookup_organization_by_code",
            {
              p_code:
                normalized,
            }
          );

        if (error) {
          throw error;
        }

        const found =
          Array.isArray(
            data
          )
            ? data[0]
            : null;

        if (!found) {
          throw new Error(
            "Código de igreja não encontrado."
          );
        }

        setChurch(
          found as
            OrganizationLookup
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível verificar o código.";

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
    handleJoin() {
      setErrorMessage(
        null
      );

      const normalized =
        normalizeCode(
          code
        );

      if (
        normalized.length <
        4
      ) {
        setErrorMessage(
          "Digite o código da sua igreja."
        );

        return;
      }

      setLoading(
        true
      );

      try {
        const {
          error,
        } =
          await supabase.rpc(
            "join_organization_by_code",
            {
              p_code:
                normalized,
            }
          );

        if (error) {
          throw error;
        }

        await clearPendingEntry();

        await onChanged();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível entrar na igreja.";

        setErrorMessage(
          message
        );
      } finally {
        setLoading(
          false
        );
      }
    }

  if (
    initializing
  ) {
    return (
      <View
        style={
          styles.loading
        }
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (
    mode === "create"
  ) {
    return (
      <View
        style={
          styles.flex
        }
      >
        <View
          style={
            styles.createBackWrap
          }
        >
          <Pressable
            onPress={() => {
              void (async () => {
                await clearPendingEntry();

                setMode(
                  "choices"
                );
              })();
            }}
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
        </View>

        <OrganizationSetupScreen
          displayName={
            displayName
          }
          onCreated={
            async () => {
              await clearPendingEntry();

              await onChanged();
            }
          }
        />
      </View>
    );
  }

  if (
    mode === "join"
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
              styles.content
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            <Pressable
              onPress={() => {
                void (async () => {
                  await clearPendingEntry();

                  setChurch(
                    null
                  );

                  setErrorMessage(
                    null
                  );

                  setMode(
                    "choices"
                  );
                })();
              }}
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

            <EloLogo
              compact
            />

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
              Digite o código compartilhado pela liderança para vincular sua conta.
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
                  code
                }
                onChangeText={(
                  value
                ) => {
                  setCode(
                    value
                      .toUpperCase()
                      .replace(
                        /\s/g,
                        ""
                      )
                  );

                  setChurch(
                    null
                  );
                }}
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

            {errorMessage && (
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
            )}

            <Pressable
              onPress={() => {
                void handleVerify();
              }}
              disabled={
                loading
              }
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed &&
                  !loading &&
                  styles.pressed,
                loading &&
                  styles.disabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator />
              ) : (
                <Text
                  style={
                    styles.secondaryButtonText
                  }
                >
                  Verificar igreja
                </Text>
              )}
            </Pressable>

            {church && (
              <View
                style={
                  styles.churchCard
                }
              >
                <View
                  style={
                    styles.churchCheck
                  }
                >
                  <Text
                    style={
                      styles.churchCheckText
                    }
                  >
                    ✓
                  </Text>
                </View>

                <View
                  style={
                    styles.churchCopy
                  }
                >
                  <Text
                    style={
                      styles.churchName
                    }
                  >
                    {church.name}
                  </Text>

                  <Text
                    style={
                      styles.churchLocation
                    }
                  >
                    {[
                      church.city,
                      church.state,
                    ]
                      .filter(
                        Boolean
                      )
                      .join(
                        " • "
                      ) ||
                      "Igreja encontrada"}
                  </Text>
                </View>
              </View>
            )}

            <Pressable
              onPress={() => {
                void handleJoin();
              }}
              disabled={
                loading ||
                !church
              }
              style={({ pressed }) => [
                styles.primaryButton,
                pressed &&
                  !loading &&
                  styles.pressed,
                (
                  loading ||
                  !church
                ) &&
                  styles.disabled,
              ]}
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Entrar na igreja →
              </Text>
            </Pressable>

            <Text
              style={
                styles.fine
              }
            >
              Se a secretaria já tiver seu cadastro com o mesmo e-mail, o Elo reaproveita essa pessoa em vez de duplicar.
            </Text>
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
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <EloLogo
          compact
        />

        <Text
          style={
            styles.kicker
          }
        >
          BEM-VINDO AO ELO
        </Text>

        <Text
          style={
            styles.title
          }
        >
          Como quer começar?
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Sem formulário longo. Escolha só o caminho que faz sentido para você.
        </Text>

        <Pressable
          onPress={() =>
            setMode(
              "join"
            )
          }
          style={({ pressed }) => [
            styles.choiceCard,
            styles.choiceCardPrimary,
            pressed &&
              styles.pressed,
          ]}
        >
          <View
            style={
              styles.choiceIcon
            }
          >
            <Text
              style={
                styles.choiceIconText
              }
            >
              ⌁
            </Text>
          </View>

          <View
            style={
              styles.choiceCopy
            }
          >
            <Text
              style={
                styles.choiceTitle
              }
            >
              Entrar na minha igreja
            </Text>

            <Text
              style={
                styles.choiceDescription
              }
            >
              Use o código compartilhado pela liderança.
            </Text>
          </View>

          <Text
            style={
              styles.choiceArrow
            }
          >
            →
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            setMode(
              "create"
            )
          }
          style={({ pressed }) => [
            styles.choiceCard,
            pressed &&
              styles.pressed,
          ]}
        >
          <View
            style={
              styles.choiceIcon
            }
          >
            <Text
              style={
                styles.choiceIconText
              }
            >
              ⛪
            </Text>
          </View>

          <View
            style={
              styles.choiceCopy
            }
          >
            <Text
              style={
                styles.choiceTitle
              }
            >
              Criar uma igreja
            </Text>

            <Text
              style={
                styles.choiceDescription
              }
            >
              Configure o básico agora. O restante pode esperar.
            </Text>
          </View>

          <Text
            style={
              styles.choiceArrow
            }
          >
            →
          </Text>
        </Pressable>

        <Text
          style={
            styles.fine
          }
        >
          Seu perfil começa simples e ganha recursos conforme sua função na igreja.
        </Text>
      </ScrollView>
    </SafeAreaView>
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

    loading: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#f7f9fc",
    },

    content: {
      flexGrow: 1,
      width: "100%",
      maxWidth: 520,
      alignSelf:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        24,
      paddingVertical:
        32,
    },

    kicker: {
      marginTop: 18,
      marginBottom: 8,
      fontSize: 11,
      fontWeight:
        "800",
      letterSpacing:
        1.4,
      color:
        "#6d7480",
    },

    title: {
      fontSize: 31,
      lineHeight: 37,
      fontWeight:
        "800",
      color:
        "#17191c",
    },

    subtitle: {
      marginTop: 10,
      marginBottom:
        28,
      fontSize: 15,
      lineHeight: 22,
      color:
        "#6d7480",
    },

    choiceCard: {
      minHeight: 86,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      marginBottom: 12,
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#e0e4e9",
      borderRadius: 18,
      backgroundColor:
        "#ffffff",
    },

    choiceCardPrimary: {
      borderColor:
        "#cfdde8",
      backgroundColor:
        "#f4f9fc",
    },

    choiceIcon: {
      width: 43,
      height: 43,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 14,
      backgroundColor:
        "#edf3f7",
    },

    choiceIconText: {
      fontSize: 21,
    },

    choiceCopy: {
      flex: 1,
    },

    choiceTitle: {
      fontSize: 15,
      fontWeight:
        "800",
      color:
        "#22262b",
    },

    choiceDescription: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 17,
      color:
        "#737b85",
    },

    choiceArrow: {
      fontSize: 20,
      color:
        "#59616b",
    },

    field: {
      gap: 7,
      marginBottom:
        14,
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
      paddingHorizontal:
        15,
      borderWidth: 1,
      borderColor:
        "#dfe3e8",
      borderRadius: 14,
      backgroundColor:
        "#ffffff",
      fontSize: 16,
      color:
        "#17191c",
    },

    secondaryButton: {
      minHeight: 52,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#dfe3e8",
      borderRadius: 14,
      backgroundColor:
        "#ffffff",
    },

    secondaryButtonText: {
      fontSize: 15,
      fontWeight:
        "800",
      color:
        "#343a40",
    },

    churchCard: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 11,
      marginTop: 12,
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#d9e9df",
      borderRadius: 16,
      backgroundColor:
        "#f4faf6",
    },

    churchCheck: {
      width: 34,
      height: 34,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 12,
      backgroundColor:
        "#dff0e5",
    },

    churchCheckText: {
      fontSize: 17,
      fontWeight:
        "900",
      color:
        "#2d7b49",
    },

    churchCopy: {
      flex: 1,
    },

    churchName: {
      fontSize: 14,
      fontWeight:
        "800",
      color:
        "#242a27",
    },

    churchLocation: {
      marginTop: 3,
      fontSize: 12,
      color:
        "#727a75",
    },

    primaryButton: {
      minHeight: 53,
      marginTop: 12,
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
        "#525a64",
    },

    createBackWrap: {
      position:
        "absolute",
      top: 20,
      left: 20,
      zIndex: 10,
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

    fine: {
      marginTop: 18,
      fontSize: 12,
      lineHeight: 18,
      textAlign:
        "center",
      color:
        "#8a9098",
    },

    pressed: {
      opacity: 0.78,
    },

    disabled: {
      opacity: 0.5,
    },
  });
