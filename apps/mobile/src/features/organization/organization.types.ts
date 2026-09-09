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

  permissions: string[];
};

export type MyContextResponse = {
  profile: OrganizationProfile | null;
  organizations: OrganizationContextItem[];
};