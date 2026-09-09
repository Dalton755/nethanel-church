import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function AgendaScreen() {
  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.safeArea}
    >
      <View style={styles.content}>
        <Text style={styles.title}>
          Agenda
        </Text>

        <Text style={styles.subtitle}>
          Cultos, eventos, reuniões e
          compromissos da igreja aparecerão
          aqui.
        </Text>

        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            Nenhum evento cadastrado
          </Text>

          <Text style={styles.emptyText}>
            A agenda central será um dos
            próximos módulos conectados ao
            contexto da igreja.
          </Text>
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
    color: "#111111",
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