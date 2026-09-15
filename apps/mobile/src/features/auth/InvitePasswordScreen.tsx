import {
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  Ionicons,
} from "@expo/vector-icons";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  supabase,
} from "../../lib/supabase";


type InvitePasswordScreenProps = {
  onCompleted:
    () => void;
};


export function InvitePasswordScreen({
  onCompleted,
}: InvitePasswordScreenProps) {
  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirmation,
    setConfirmation,
  ] =
    useState("");

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);


  async function handleSave() {
    if (
      password.length <
      8
    ) {
      Alert.alert(
        "Crie sua senha",
        "A senha precisa ter pelo menos 8 caracteres."
      );

      return;
    }


    if (
      password !==
      confirmation
    ) {
      Alert.alert(
        "Senhas diferentes",
        "Digite a mesma senha nos dois campos."
      );

      return;
    }


    setSaving(
      true
    );


    try {
      const {
        error,
      } =
        await supabase.auth.updateUser({
          password,
        });


      if (error) {
        throw error;
      }


      Alert.alert(
        "Acesso criado",
        "Sua senha foi definida. Você já pode acessar o Nethanel Church.",
        [
          {
            text:
              "Continuar",

            onPress:
              onCompleted,
          },
        ]
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível definir sua senha.";


      Alert.alert(
        "Não foi possível concluir",
        message
      );
    } finally {
      setSaving(
        false
      );
    }
  }


  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
    >
      <View
        style={
          styles.content
        }
      >
        <View
          style={
            styles.icon
          }
        >
          <Ionicons
            name="key-outline"
            size={28}
            color="#333333"
          />
        </View>


        <Text
          style={
            styles.title
          }
        >
          Crie sua senha
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          Seu convite foi confirmado. Agora escolha uma senha para acessar o Nethanel Church.
        </Text>


        <View
          style={
            styles.form
          }
        >
          <Text
            style={
              styles.label
            }
          >
            Nova senha
          </Text>

          <View
            style={
              styles.passwordField
            }
          >
            <TextInput
              value={
                password
              }
              onChangeText={
                setPassword
              }
              secureTextEntry={
                !showPassword
              }
              autoCapitalize="none"
              autoCorrect={
                false
              }
              placeholder="Mínimo de 8 caracteres"
              placeholderTextColor="#999999"
              style={
                styles.passwordInput
              }
            />

            <Pressable
              onPress={() =>
                setShowPassword(
                  (current) =>
                    !current
                )
              }
              hitSlop={
                8
              }
            >
              <Ionicons
                name={
                  showPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={21}
                color="#777777"
              />
            </Pressable>
          </View>


          <Text
            style={[
              styles.label,
              styles.confirmLabel,
            ]}
          >
            Confirme a senha
          </Text>

          <TextInput
            value={
              confirmation
            }
            onChangeText={
              setConfirmation
            }
            secureTextEntry={
              !showPassword
            }
            autoCapitalize="none"
            autoCorrect={
              false
            }
            placeholder="Digite novamente"
            placeholderTextColor="#999999"
            style={
              styles.input
            }
          />
        </View>


        <Pressable
          disabled={
            saving
          }
          onPress={() =>
            void handleSave()
          }
          style={[
            styles.button,

            saving &&
              styles.buttonDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator
              color="#ffffff"
            />
          ) : (
            <Text
              style={
                styles.buttonText
              }
            >
              Criar senha e continuar
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}


const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: "#f7f7f6",
    },

    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 70,
    },

    icon: {
      width: 54,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: "#e9e9e6",
    },

    title: {
      marginTop: 24,
      fontSize: 28,
      fontWeight: "700",
      color: "#111111",
    },

    subtitle: {
      marginTop: 9,
      maxWidth: 420,
      fontSize: 14,
      lineHeight: 21,
      color: "#707070",
    },

    form: {
      marginTop: 34,
    },

    label: {
      marginBottom: 7,
      fontSize: 13,
      fontWeight: "700",
      color: "#333333",
    },

    confirmLabel: {
      marginTop: 18,
    },

    input: {
      minHeight: 52,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "#ddddda",
      borderRadius: 12,
      backgroundColor: "#ffffff",
      fontSize: 15,
      color: "#202020",
    },

    passwordField: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "#ddddda",
      borderRadius: 12,
      backgroundColor: "#ffffff",
    },

    passwordInput: {
      flex: 1,
      fontSize: 15,
      color: "#202020",
    },

    button: {
      minHeight: 52,
      marginTop: 28,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: "#202020",
    },

    buttonDisabled: {
      opacity: 0.55,
    },

    buttonText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#ffffff",
    },
  });