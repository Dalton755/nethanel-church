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

  person: OrganizationPerson;

  units: OrganizationUnit[];

  roles: OrganizationRole[];

  /*
   * Mantido porque get_my_context
   * ainda retorna este campo.
   *
   * O aplicativo não usará mais
   * esta lista como fonte autoritativa
   * de autorização.
   */
  permissions: string[];
};

export type MyContextResponse = {
  profile: OrganizationProfile | null;
  organizations: OrganizationContextItem[];
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

  /*
   * Permissões que realmente valem
   * para toda a organização.
   */
  organization_permissions: string[];

  /*
   * Permissões efetivas em cada unidade.
   *
   * Perfis globais aparecem aqui também,
   * pois são válidos naquela unidade.
   */
  units: AccessMatrixUnit[];
};

export type MyAccessMatrixResponse = {
  organizations: AccessMatrixOrganization[];
};