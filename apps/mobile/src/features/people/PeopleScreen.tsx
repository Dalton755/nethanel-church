import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrganization } from "../../contexts/OrganizationContext";

export function PeopleScreen() {
  const { permissions } =
    useOrganization();

  const canViewPeople =
    permissions.includes("people.view") ||
    permissions.includes("people.manage");

  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.safeArea}
    >
      <View style={styles.content}>
        <Text style={styles.title}>
          Pessoas
        </Text>

        {canViewPeople ? (
          <>
            <Text style={styles.subtitle}>
              Membros, congregados, visitantes
              e demais pessoas vinculadas à
              igreja.
            </Text>

            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                Cadastro de pessoas
              </Text>

              <Text style={styles.emptyText}>
                A estrutura de pessoas já está
                pronta no banco. A interface
                será conectada aqui.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              Acesso restrito
            </Text>

            <Text style={styles.emptyText}>
              Seu perfil não possui permissão
              para consultar pessoas.
            </Text>
          </View>
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
    paddingHorizontal: 20,
    paddingTop: 26,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
  },

  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: "#686868",
  },

  empty: {
    marginTop: 32,
    paddingVertical: 26,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e2e2df",
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },

  emptyText: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: "#737373",
  },
});