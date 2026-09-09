import {
  useCallback,
  useEffect,
  useState,
} from "react";
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
import { OrganizationSetupScreen } from "../organization/OrganizationSetupScreen";

type AuthenticatedScreenProps = {
  session: Session;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
};

export function AuthenticatedScreen({
  session,
}: AuthenticatedScreenProps) {
  const [displayName, setDisplayName] =
    useState<string | null>(null);

  const [organization, setOrganization] =
    useState<Organization | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const loadContext = useCallback(
    async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const [
          profileResponse,
          organizationsResponse,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name")
            .eq(
              "user_id",
              session.user.id
            )
            .single(),

          supabase
            .from("organizations")
            .select("id, name, slug")
            .order("created_at", {
              ascending: true,
            }),
        ]);

        if (profileResponse.error) {
          throw profileResponse.error;
        }

        if (organizationsResponse.error) {
          throw organizationsResponse.error;
        }

        setDisplayName(
          profileResponse.data.display_name
        );

        setOrganization(
          organizationsResponse.data?.[0] ??
            null
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar sua conta.";

        setErrorMessage(message);
      } finally {
        setLoading(false);
      }
    },
    [session.user.id]
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View style={styles.content}>
          <Text style={styles.brand}>
            NETHANEL CHURCH
          </Text>

          <Text style={styles.title}>
            Não foi possível carregar sua conta
          </Text>

          <Text style={styles.errorText}>
            {errorMessage}
          </Text>

          <Pressable
            onPress={() => {
              void loadContext();
            }}
            style={styles.primaryButton}
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Tentar novamente
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSignOut}
            style={styles.secondaryButton}
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Sair
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!organization) {
    return (
      <OrganizationSetupScreen
        displayName={displayName}
        onCreated={loadContext}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.brand}>
          NETHANEL CHURCH
        </Text>

        <Text style={styles.eyebrow}>
          {displayName
            ? `Olá, ${displayName}`
            : "Bem-vindo"}
        </Text>

        <Text style={styles.title}>
          {organization.name}
        </Text>

        <Text style={styles.subtitle}>
          Sua igreja está configurada e pronta
          para receber os primeiros módulos.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            Organização ativa
          </Text>

          <Text style={styles.cardValue}>
            {organization.name}
          </Text>

          <Text style={styles.cardLabel}>
            Identificador
          </Text>

          <Text style={styles.cardValue}>
            {organization.slug}
          </Text>
        </View>

        <Pressable
          onPress={handleSignOut}
          style={styles.secondaryButton}
        >
          <Text
            style={
              styles.secondaryButtonText
            }
          >
            Sair
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f7f6",
  },

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
    marginBottom: 28,
  },

  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: "#ddddda",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    gap: 5,
  },

  cardLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#777777",
    textTransform: "uppercase",
  },

  cardValue: {
    fontSize: 16,
    color: "#222222",
  },

  errorText: {
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 20,
    color: "#8b1e1e",
  },

  primaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#171717",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },

  secondaryButton: {
    minHeight: 48,
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333333",
  },
});