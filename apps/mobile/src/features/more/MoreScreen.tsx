import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";

export function MoreScreen() {
  const {
    profile,
    organizations,
    activeOrganization,
    activeUnit,
    clearOrganizationSelection,
  } = useOrganization();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.safeArea}
    >
      <View style={styles.content}>
        <Text style={styles.title}>
          Mais
        </Text>

        <View style={styles.account}>
          <Text style={styles.name}>
            {profile?.display_name ??
              "Usuário"}
          </Text>

          <Text style={styles.organization}>
            {activeOrganization?.name}
          </Text>

          <Text style={styles.unit}>
            {activeUnit?.name}
          </Text>
        </View>

        <View style={styles.actions}>
          {organizations.length > 1 && (
            <Pressable
              onPress={() => {
                void clearOrganizationSelection();
              }}
              style={styles.action}
            >
              <Text style={styles.actionText}>
                Trocar igreja
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleSignOut}
            style={styles.action}
          >
            <Text style={styles.actionText}>
              Sair da conta
            </Text>
          </Pressable>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 26,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
  },

  account: {
    marginTop: 28,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e1e1de",
  },

  name: {
    fontSize: 18,
    fontWeight: "700",
  },

  organization: {
    marginTop: 8,
    fontSize: 14,
    color: "#555555",
  },

  unit: {
    marginTop: 3,
    fontSize: 13,
    color: "#777777",
  },

  actions: {
    marginTop: 12,
  },

  action: {
    minHeight: 52,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e1de",
  },

  actionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222222",
  },
});