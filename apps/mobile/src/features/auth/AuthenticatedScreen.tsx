import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";

type AuthenticatedScreenProps = {
  session: Session;
};

export function AuthenticatedScreen({
  session,
}: AuthenticatedScreenProps) {
  const [displayName, setDisplayName] =
    useState<string | null>(null);

  const [loadingProfile, setLoadingProfile] =
    useState(true);

  const [profileError, setProfileError] =
    useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", session.user.id)
        .single();

      if (error) {
        setProfileError(error.message);
        setLoadingProfile(false);
        return;
      }

      setDisplayName(data.display_name);
      setLoadingProfile(false);
    }

    loadProfile();
  }, [session.user.id]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.brand}>
          NETHANEL CHURCH
        </Text>

        {loadingProfile ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={styles.title}>
              {displayName
                ? `Olá, ${displayName}`
                : "Olá"}
            </Text>

            <Text style={styles.subtitle}>
              Sua autenticação está funcionando.
            </Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>
                Conta
              </Text>

              <Text style={styles.infoValue}>
                {session.user.email}
              </Text>

              <Text style={styles.infoLabel}>
                Perfil
              </Text>

              <Text style={styles.infoValue}>
                {profileError
                  ? `Erro: ${profileError}`
                  : "Profile carregado com RLS"}
              </Text>
            </View>

            <Pressable
              onPress={handleSignOut}
              style={styles.button}
            >
              <Text style={styles.buttonText}>
                Sair
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f6",
  },

  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  brand: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.4,
    marginBottom: 18,
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 15,
    color: "#626262",
    marginBottom: 28,
  },

  infoBox: {
    borderWidth: 1,
    borderColor: "#ddddda",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 6,
  },

  infoLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#777777",
    textTransform: "uppercase",
  },

  infoValue: {
    fontSize: 15,
    color: "#222222",
  },

  button: {
    height: 50,
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d4d4d0",
    alignItems: "center",
    justifyContent: "center",
  },

  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});