import { useState } from "react";
import { useOrganization } from "../../contexts/OrganizationContext";

import { AccessRolesScreen } from "./AccessRolesScreen";
import { ChurchBillingScreen } from "./ChurchBillingScreen";
import { ChurchPersonalizationScreen } from "./ChurchPersonalizationScreen";
import { ChurchStructureScreen } from "./ChurchStructureScreen";
import { PeopleAccessScreen } from "./PeopleAccessScreen";
import { EloModuleCard, EloScreen } from "../elo/EloUi";

type Props = {
  onBack: () => void;
};

type Section = "home" | "roles" | "people" | "branding" | "billing" | "structure";

export function ChurchManagementScreen({ onBack }: Props) {
  const [section, setSection] = useState<Section>("home");
  const { activeOrganization, activeUnit } = useOrganization();

  if (section === "structure" && activeOrganization && activeUnit) {
    return (
      <ChurchStructureScreen
        organizationId={activeOrganization.id}
        unitId={activeUnit.id}
        onBack={() => setSection("home")}
        onCompleted={() => setSection("home")}
      />
    );
  }

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
        icon="TreeStructureIcon"
        title="Estrutura da igreja"
        description="Defina departamentos, equipes, cargos ministeriais e modelos de escala. Pode mudar quando quiser."
        badge="Todos os planos"
        onPress={() => setSection("structure")}
      />

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
