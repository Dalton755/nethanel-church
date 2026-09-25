import AsyncStorage from "@react-native-async-storage/async-storage";
import {
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

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";

import { OrganizationSelectorScreen } from "../organization/OrganizationSelectorScreen";
import { OrganizationEntryScreen } from "../organization/OrganizationEntryScreen";
import { MainTabs } from "../../navigation/MainTabs";
import { PushNotificationRegistration } from "../notifications/PushNotificationRegistration";

const PENDING_JOIN_CODE_KEY =
  "@elo/pending-join-code";

const PENDING_ENTRY_INTENT_KEY =
  "@elo/pending-entry-intent";

export function AuthenticatedScreen() {
  const {
    profile,
    organizations,
    activeOrganization,
    loading,
    errorMessage,
    refreshContext,
    selectOrganization,
  } = useOrganization();

  const [
    checkingEntryIntent,
    setCheckingEntryIntent,
  ] =
    useState(true);

  const [
    hasPendingEntryIntent,
    setHasPendingEntryIntent,
  ] =
    useState(false);

  useEffect(() => {
    let mounted =
      true;

    async function
      loadEntryIntent() {
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

          if (
            mounted
          ) {
            setHasPendingEntryIntent(
              Boolean(
                pendingCode ||
                  pendingIntent
              )
            );
          }
        } finally {
          if (
            mounted
          ) {
            setCheckingEntryIntent(
              false
            );
          }
        }
      }

    void loadEntryIntent();

    return () => {
      mounted =
        false;
    };
  }, []);

  async function
    handleSignOut() {
      await supabase.auth.signOut();
    }

  async function
    handleEntryChanged() {
      setHasPendingEntryIntent(
        false
      );

      await refreshContext();
    }

  if (
    loading ||
    checkingEntryIntent
  ) {
    return (
      <View
        style={
          styles.loading
        }
      >
        <ActivityIndicator
          size="large"
        />
      </View>
    );
  }

  if (errorMessage) {
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
          <Text
            style={
              styles.brand
            }
          >
            NETHANEL ELO
          </Text>

          <Text
            style={
              styles.title
            }
          >
            Não foi possível carregar sua conta
          </Text>

          <Text
            style={
              styles.errorText
            }
          >
            {errorMessage}
          </Text>

          <Pressable
            onPress={() => {
              void refreshContext();
            }}
            style={
              styles.primaryButton
            }
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
            onPress={
              handleSignOut
            }
            style={
              styles.secondaryButton
            }
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

  if (
    hasPendingEntryIntent ||
    organizations.length ===
      0
  ) {
    return (
      <OrganizationEntryScreen
        displayName={
          profile?.display_name
        }
        onChanged={
          handleEntryChanged
        }
      />
    );
  }

  if (
    !activeOrganization
  ) {
    return (
      <OrganizationSelectorScreen
        displayName={
          profile?.display_name
        }
        organizations={
          organizations
        }
        onSelect={
          selectOrganization
        }
        onSignOut={
          handleSignOut
        }
      />
    );
  }

  return (
    <>
      <PushNotificationRegistration />
      <MainTabs />
    </>
  );
}

const styles =
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#f7f9fc",
    },

    safeArea: {
      flex: 1,
      backgroundColor:
        "#f7f9fc",
    },

    content: {
      flex: 1,
      justifyContent:
        "center",
      paddingHorizontal:
        24,
    },

    brand: {
      marginBottom: 28,
      fontSize: 12,
      fontWeight:
        "700",
      letterSpacing:
        2.4,
      color:
        "#25282c",
    },

    title: {
      marginBottom: 10,
      fontSize: 30,
      lineHeight: 36,
      fontWeight:
        "700",
      color:
        "#111111",
    },

    errorText: {
      marginBottom: 24,
      fontSize: 14,
      lineHeight: 20,
      color:
        "#8b1e1e",
    },

    primaryButton: {
      height: 50,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 12,
      backgroundColor:
        "#171717",
    },

    primaryButtonText: {
      fontSize: 15,
      fontWeight:
        "700",
      color:
        "#ffffff",
    },

    secondaryButton: {
      minHeight: 48,
      marginTop: 12,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    secondaryButtonText: {
      fontSize: 15,
      fontWeight:
        "600",
      color:
        "#333333",
    },
  });
