import { useState } from "react";

import { AccessRolesScreen } from "./AccessRolesScreen";
import { ChurchBillingScreen } from "./ChurchBillingScreen";
import { ChurchPersonalizationScreen } from "./ChurchPersonalizationScreen";
import { PeopleAccessScreen } from "./PeopleAccessScreen";
import { EloModuleCard, EloScreen } from "../elo/EloUi";

type Props = {
  onBack: () => void;
};

type Section = "home" | "roles" | "people" | "branding" | "billing";

export function ChurchManagementScreen({ onBack }: Props) {
  const [section, setSection] = useState<Section>("home");

  if (section === "roles") {
    return <AccessRolesScreen onBack={() => setSection("home")} />;
  }

  if (section === "people") {
    return <PeopleAccessScreen onBack={() => setSection("home")} />;
  }

  if (section === "branding") {
    return (
      <ChurchPersonalizationScreen
        onBack={() => setSection("home")}
      />
    );
  }

  if (section === "billing") {
    return <ChurchBillingScreen onBack={() => setSection("home")} />;
  }

  return (
    <EloScreen
      title="Administração Elo"
      eyebrow="GESTÃO • SEGURANÇA"
      subtitle="Controle acessos, identidade da igreja e a contratação do Nethanel Elo."
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
        icon="CreditCardIcon"
        title="Plano e assinatura"
        description="Acompanhe o teste, compare planos e gerencie a cobrança do Elo."
        badge="ADM"
        onPress={() => setSection("billing")}
      />

      <EloModuleCard
        icon="PaletteIcon"
        title="Personalização da igreja"
        description="Nome, logo, cores e recursos de marca liberados pelo plano."
        badge="ADM"
        onPress={() => setSection("branding")}
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
