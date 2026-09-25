import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";

import { OrganizationSelectorScreen } from "../organization/OrganizationSelectorScreen";
import { OrganizationSetupScreen } from "../organization/OrganizationSetupScreen";
import { MainTabs } from "../../navigation/MainTabs";
import { PushNotificationRegistration } from "../notifications/PushNotificationRegistration";

export function AuthenticatedScreen() {
  const {
    profile,
    organizations,
    activeOrganization,
    activeUnit,
    permissions,
    loading,
    errorMessage,
    refreshContext,
    selectOrganization,
    clearOrganizationSelection,
  } = useOrganization();

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
              void refreshContext();
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

  if (organizations.length === 0) {
    return (
      <OrganizationSetupScreen
        displayName={
          profile?.display_name
        }
        onCreated={refreshContext}
      />
    );
  }

  if (!activeOrganization) {
    return (
      <OrganizationSelectorScreen
        displayName={
          profile?.display_name
        }
        organizations={organizations}
        onSelect={selectOrganization}
        onSignOut={handleSignOut}
      />
    );
  }

  const ownerRole =
    activeOrganization.roles.find(
      (role) => role.is_owner
    );

  return (
    <>
      <PushNotificationRegistration />
      <MainTabs />
    </>
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
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333333",
  },
});