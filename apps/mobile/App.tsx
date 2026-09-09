import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import { supabase } from "./src/lib/supabase";

type ConnectionStatus =
  | "checking"
  | "connected"
  | "error";

export default function App() {
  const [status, setStatus] =
    useState<ConnectionStatus>("checking");

  const [message, setMessage] = useState(
    "Conectando ao servidor..."
  );

  useEffect(() => {
    async function testConnection() {
      try {
        // Garante que o cliente Supabase foi inicializado.
        void supabase;

        const supabaseUrl =
          process.env.EXPO_PUBLIC_SUPABASE_URL;

        if (!supabaseUrl) {
          throw new Error(
            "EXPO_PUBLIC_SUPABASE_URL não configurada."
          );
        }

        const response = await fetch(
          `${supabaseUrl}/auth/v1/health`
        );

        if (!response.ok) {
          throw new Error(
            `Servidor respondeu HTTP ${response.status}`
          );
        }

        const data = await response.json();

        setStatus("connected");
        setMessage(
          `Supabase conectado • ${data.name ?? "Auth"} ${data.version ?? ""}`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Erro desconhecido.";

        setStatus("error");
        setMessage(errorMessage);
      }
    }

    testConnection();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.brand}>
          NETHANEL CHURCH
        </Text>

        <Text style={styles.title}>
          Infraestrutura Mobile
        </Text>

        {status === "checking" && (
          <ActivityIndicator size="large" />
        )}

        <View style={styles.status}>
          <Text style={styles.statusTitle}>
            {status === "checking" &&
              "Conectando..."}

            {status === "connected" &&
              "✓ Supabase conectado"}

            {status === "error" &&
              "Falha na conexão"}
          </Text>

          <Text style={styles.message}>
            {message}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f7",
  },

  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  brand: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 12,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 32,
  },

  status: {
    marginTop: 24,
  },

  statusTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },

  message: {
    fontSize: 14,
    lineHeight: 20,
  },
});