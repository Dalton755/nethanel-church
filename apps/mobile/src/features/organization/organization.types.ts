export type OrganizationProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: string;
  timezone: string;
};

export type OrganizationPerson = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
};

export type OrganizationUnit = {
  id: string;
  name: string;
  slug: string;
  unit_type: string;
  is_headquarters: boolean;
  status: string;
  timezone: string;
};

export type OrganizationRole = {
  assignment_id: string;
  role_id: string;
  name: string;
  role_key: string;
  description: string | null;
  is_owner: boolean;
  is_system: boolean;
  unit_id: string | null;
};

export type OrganizationContextItem = {
  id: string;
  name: string;
  slug: string;
  status: string;

  logo_url: string | null;
  primary_color: string;

  /* Identidade expandida do Elo. */
  app_name: string;
  secondary_color: string;
  background_color: string;
  app_icon_url: string | null;
  splash_url: string | null;
  white_label_enabled: boolean;
  custom_domain: string | null;

  person: OrganizationPerson;
  units: OrganizationUnit[];
  roles: OrganizationRole[];

  /*
   * Mantido porque get_my_context ainda retorna este campo.
   * A autorização efetiva continua vindo de get_my_access_matrix().
   */
  permissions: string[];
};

export type MyContextResponse = {
  profile: OrganizationProfile | null;
  organizations: OrganizationContextItem[];
};

export type OrganizationBrandingContextItem = {
  organization_id: string;
  app_name: string;
  logo_url: string | null;
  app_icon_url: string | null;
  splash_url: string | null;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  white_label_enabled: boolean;
  custom_domain: string | null;
};

export type MyBrandingContextResponse = {
  organizations: OrganizationBrandingContextItem[];
};

/*
 * ============================================================
 * MATRIZ DE ACESSO
 * ============================================================
 */

export type AccessMatrixUnit = {
  unit_id: string;
  permissions: string[];
};

export type AccessMatrixOrganization = {
  organization_id: string;
  organization_permissions: string[];
  units: AccessMatrixUnit[];
};

export type MyAccessMatrixResponse = {
  organizations: AccessMatrixOrganization[];
};
