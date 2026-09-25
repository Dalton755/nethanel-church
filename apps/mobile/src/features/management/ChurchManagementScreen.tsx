import { useState } from "react";

import { AccessRolesScreen } from "./AccessRolesScreen";
import { PeopleAccessScreen } from "./PeopleAccessScreen";
import {
  EloModuleCard,
  EloScreen,
  eloSharedStyles,
} from "../elo/EloUi";

type Props = {
  onBack: () => void;
};

export function ChurchManagementScreen({ onBack }: Props) {
  const [section, setSection] =
    useState<"home" | "roles" | "people">("home");

  if (section === "roles") {
    return <AccessRolesScreen onBack={() => setSection("home")} />;
  }

  if (section === "people") {
    return <PeopleAccessScreen onBack={() => setSection("home")} />;
  }

  return (
    <EloScreen
      title="Administração Elo"
      eyebrow="ACESSOS • SEGURANÇA"
      subtitle="Controle quem entra, quais perfis cada pessoa possui e o alcance desses acessos."
      onBack={onBack}
    >
      <EloModuleCard
        icon="UsersThreeIcon"
        title="Pessoas e acessos"
        description="Conceda, revise e remova acessos das pessoas cadastradas."
        badge="Real"
        onPress={() => setSection("people")}
      />

      <EloModuleCard
        icon="ShieldCheckIcon"
        title="Perfis de acesso"
        description="Administração, pastor, secretaria, tesouraria, liderança, voluntários e membros."
        badge="Real"
        onPress={() => setSection("roles")}
      />
    </EloScreen>
  );
}
