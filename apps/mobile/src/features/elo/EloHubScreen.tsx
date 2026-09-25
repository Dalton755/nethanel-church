import { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import { ChurchManagementScreen } from "../management/ChurchManagementScreen";
import { CommunicationScreen } from "./CommunicationScreen";
import { DepartmentsScreen } from "./DepartmentsScreen";
import { EventsScreen } from "./EventsScreen";
import { KidsScreen } from "./KidsScreen";
import { QrScannerScreen } from "./QrScannerScreen";
import { SchedulesScreen } from "./SchedulesScreen";
import {
  EloModuleCard,
  EloScreen,
  EloState,
  eloColors,
  eloSharedStyles,
} from "./EloUi";

export type EloModuleKey =
  | "schedules"
  | "events"
  | "kids"
  | "departments"
  | "communication"
  | "scanner"
  | "management";

type EloHubProps = {
  route?: {
    params?: {
      module?: EloModuleKey;
      nonce?: number;
    };
  };
};

export function EloHubScreen({ route }: EloHubProps) {
  const {
    activeOrganization,
    activeUnit,
    can,
    canAtOrganization,
  } = useOrganization();

  const [activeModule, setActiveModule] =
    useState<EloModuleKey | null>(null);

  useEffect(() => {
    if (route?.params?.module) {
      setActiveModule(route.params.module);
    }
  }, [route?.params?.module, route?.params?.nonce]);

  const permissions = useMemo(
    () => ({
      kids:
        can("kids.parent") ||
        can("kids.manage") ||
        canAtOrganization("kids.parent") ||
        canAtOrganization("kids.manage"),

      departments:
        can("departments.view") ||
        can("departments.manage") ||
        canAtOrganization("departments.view") ||
        canAtOrganization("departments.manage"),

      communication:
        canAtOrganization("communication.send"),

      scanner:
        can("events.checkin") ||
        can("schedules.manage") ||
        can("kids.manage") ||
        canAtOrganization("events.checkin") ||
        canAtOrganization("schedules.manage") ||
        canAtOrganization("kids.manage"),

      management:
        canAtOrganization("security.manage") ||
        canAtOrganization("organization.manage") ||
        canAtOrganization("units.manage") ||
        canAtOrganization("audit.view"),
    }),
    [can, canAtOrganization]
  );

  if (activeModule === "schedules") {
    return <SchedulesScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "events") {
    return <EventsScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "kids") {
    return <KidsScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "departments") {
    return <DepartmentsScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "communication") {
    return <CommunicationScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "scanner") {
    return <QrScannerScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "management") {
    return <ChurchManagementScreen onBack={() => setActiveModule(null)} />;
  }

  return (
    <EloScreen
      title="Meu Elo"
      eyebrow="TUDO CONECTADO"
      subtitle="As ferramentas que fazem sentido para sua função aparecem aqui."
    >
      <View style={styles.contextCard}>
        <View style={styles.contextDot} />
        <View style={styles.contextCopy}>
          <Text style={styles.contextName}>
            {activeOrganization?.name ?? "Sua igreja"}
          </Text>
          <Text style={styles.contextUnit}>
            {activeUnit?.name ?? "Unidade atual"}
          </Text>
        </View>
      </View>

      <Text style={eloSharedStyles.sectionTitle}>Minha rotina</Text>

      <EloModuleCard
        icon="ClipboardTextIcon"
        title="Minhas escalas"
        description="Confirme, peça substituição, faça check-in e use seu QR."
        badge="Real"
        onPress={() => setActiveModule("schedules")}
      />

      <EloModuleCard
        icon="TicketIcon"
        title="Eventos"
        description="Veja eventos, faça inscrição e abra o QR de entrada."
        badge="Real"
        onPress={() => setActiveModule("events")}
      />

      {permissions.kids ? (
        <EloModuleCard
          icon="BabyIcon"
          title="Elo Kids"
          description="Check-in, retirada segura, chamados e operação das salas."
          badge="Real"
          onPress={() => setActiveModule("kids")}
        />
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>Igreja e equipes</Text>

      {permissions.departments ? (
        <EloModuleCard
          icon="UsersThreeIcon"
          title="Departamentos"
          description="Ministérios, equipes, líderes e estrutura de serviço."
          badge="Real"
          onPress={() => setActiveModule("departments")}
        />
      ) : null}

      {permissions.communication ? (
        <EloModuleCard
          icon="MegaphoneIcon"
          title="Comunicação"
          description="Envie avisos para a igreja e acompanhe o histórico."
          badge="Push"
          onPress={() => setActiveModule("communication")}
        />
      ) : null}

      {permissions.scanner ? (
        <EloModuleCard
          icon="QrCodeIcon"
          title="Leitor QR"
          description="Um leitor para escalas, eventos e Elo Kids."
          badge="Check-in"
          onPress={() => setActiveModule("scanner")}
        />
      ) : null}

      {permissions.management ? (
        <>
          <Text style={eloSharedStyles.sectionTitle}>Administração</Text>

          <EloModuleCard
            icon="ShieldCheckIcon"
            title="Administração Elo"
            description="Pessoas, acessos, perfis, unidades e segurança."
            onPress={() => setActiveModule("management")}
          />
        </>
      ) : null}

      {!permissions.departments &&
      !permissions.kids &&
      !permissions.communication &&
      !permissions.scanner &&
      !permissions.management ? (
        <View style={styles.stateWrap}>
          <EloState
            title="Seu Elo está simples"
            description="Conforme sua função na igreja mudar, novos módulos aparecerão automaticamente."
            icon="SparkleIcon"
          />
        </View>
      ) : null}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  contextCard: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: eloColors.surface,
  },
  contextDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: eloColors.green,
  },
  contextCopy: {
    flex: 1,
  },
  contextName: {
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  contextUnit: {
    marginTop: 2,
    fontSize: 11,
    color: eloColors.muted,
  },
  stateWrap: {
    marginTop: 12,
  },
});
