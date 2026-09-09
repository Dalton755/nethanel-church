import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type {
  OrganizationContextItem,
} from "./organization.types";

type OrganizationSelectorScreenProps = {
  displayName?: string | null;

  organizations:
    OrganizationContextItem[];

  onSelect: (
    organizationId: string
  ) => Promise<void>;

  onSignOut: () => Promise<void>;
};

export function OrganizationSelectorScreen({
  displayName,
  organizations,
  onSelect,
  onSignOut,
}: OrganizationSelectorScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
      >
        <Text style={styles.brand}>
          NETHANEL CHURCH
        </Text>

        <Text style={styles.eyebrow}>
          {displayName
            ? `Olá, ${displayName}`
            : "Bem-vindo"}
        </Text>

        <Text style={styles.title}>
          Escolha uma igreja
        </Text>

        <Text style={styles.subtitle}>
          Você possui acesso a mais de uma
          organização.
        </Text>

        <View style={styles.list}>
          {organizations.map(
            (organization) => (
              <Pressable
                key={organization.id}
                onPress={() => {
                  void onSelect(
                    organization.id
                  );
                }}
                style={({ pressed }) => [
                  styles.organizationButton,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <View style={styles.row}>
                  <View style={styles.textArea}>
                    <Text
                      style={
                        styles.organizationName
                      }
                    >
                      {organization.name}
                    </Text>

                    <Text
                      style={
                        styles.organizationInfo
                      }
                    >
                      {
                        organization.units
                          .length
                      }{" "}
                      unidade
                      {organization.units
                        .length === 1
                        ? ""
                        : "s"}
                    </Text>
                  </View>

                  <Text style={styles.arrow}>
                    ›
                  </Text>
                </View>
              </Pressable>
            )
          )}
        </View>

        <Pressable
          onPress={() => {
            void onSignOut();
          }}
          style={styles.signOut}
        >
          <Text style={styles.signOutText}>
            Sair
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f6",
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
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
    fontWeight: "700",
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#626262",
    marginBottom: 28,
  },

  list: {
    gap: 10,
  },

  organizationButton: {
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderWidth: 1,
    borderColor: "#ddddda",
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },

  textArea: {
    flex: 1,
  },

  organizationName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#181818",
  },

  organizationInfo: {
    marginTop: 4,
    fontSize: 13,
    color: "#777777",
  },

  arrow: {
    fontSize: 28,
    color: "#777777",
  },

  pressed: {
    opacity: 0.7,
  },

  signOut: {
    minHeight: 48,
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  signOutText: {
    fontSize: 15,
    fontWeight: "600",
  },
});