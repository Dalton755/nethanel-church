import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrganization } from "../../contexts/OrganizationContext";

export function HomeScreen() {
  const {
    profile,
    activeOrganization,
    activeUnit,
  } = useOrganization();

  const firstName =
    profile?.display_name
      ?.trim()
      .split(/\s+/)[0] ?? "";

  const today = new Intl.DateTimeFormat(
    "pt-BR",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
    }
  ).format(new Date());

  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.safeArea}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.context}>
          <Text style={styles.organization}>
            {activeOrganization?.name}
          </Text>

          <Text style={styles.unit}>
            {activeUnit?.name}
          </Text>
        </View>

        <View style={styles.greeting}>
          <Text style={styles.title}>
            {firstName
              ? `Bom dia, ${firstName}`
              : "Bom dia"}
          </Text>

          <Text style={styles.date}>
            {today}
          </Text>
        </View>

        <View style={styles.sections}>
          <HomeSection
            title="Próximo culto"
            description="Nenhum culto agendado."
          />

          <HomeSection
            title="Agenda de hoje"
            description="Nenhum compromisso para hoje."
          />

          <HomeSection
            title="Pendências"
            description="Você não possui pendências."
          />

          <HomeSection
            title="Avisos"
            description="Nenhum aviso publicado."
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type HomeSectionProps = {
  title: string;
  description: string;
};

function HomeSection({
  title,
  description,
}: HomeSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {title}
        </Text>
      </View>

      <Text style={styles.sectionDescription}>
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f6",
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 32,
  },

  context: {
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e2",
  },

  organization: {
    fontSize: 15,
    fontWeight: "700",
    color: "#181818",
  },

  unit: {
    marginTop: 3,
    fontSize: 13,
    color: "#737373",
  },

  greeting: {
    paddingTop: 28,
    paddingBottom: 26,
  },

  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "700",
    color: "#111111",
  },

  date: {
    marginTop: 5,
    fontSize: 14,
    color: "#707070",
  },

  sections: {
    gap: 12,
  },

  section: {
    paddingHorizontal: 17,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#e1e1de",
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1d1d1d",
  },

  sectionDescription: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: "#737373",
  },
});