import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "../lib/supabase";

import type {
  MyContextResponse,
  OrganizationContextItem,
  OrganizationProfile,
  OrganizationUnit,
} from "../features/organization/organization.types";

type OrganizationContextValue = {
  profile: OrganizationProfile | null;

  organizations: OrganizationContextItem[];

  activeOrganization:
    | OrganizationContextItem
    | null;

  activeUnit:
    | OrganizationUnit
    | null;

  permissions: string[];

  loading: boolean;

  errorMessage: string | null;

  refreshContext: () => Promise<void>;

  selectOrganization: (
    organizationId: string
  ) => Promise<void>;

  selectUnit: (
    unitId: string
  ) => Promise<void>;

  clearOrganizationSelection:
    () => Promise<void>;
};

const OrganizationContext =
  createContext<OrganizationContextValue | null>(
    null
  );

type OrganizationProviderProps = {
  userId: string;
  children: ReactNode;
};

function getDefaultUnit(
  organization: OrganizationContextItem
) {
  return (
    organization.units.find(
      (unit) => unit.is_headquarters
    ) ??
    organization.units[0] ??
    null
  );
}

export function OrganizationProvider({
  userId,
  children,
}: OrganizationProviderProps) {
  const [profile, setProfile] =
    useState<OrganizationProfile | null>(
      null
    );

  const [
    organizations,
    setOrganizations,
  ] = useState<OrganizationContextItem[]>(
    []
  );

  const [
    activeOrganization,
    setActiveOrganization,
  ] =
    useState<OrganizationContextItem | null>(
      null
    );

  const [activeUnit, setActiveUnit] =
    useState<OrganizationUnit | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const organizationStorageKey =
    `@nethanel/active-organization/${userId}`;

  const unitStorageKey = useCallback(
    (organizationId: string) =>
      `@nethanel/active-unit/${userId}/${organizationId}`,
    [userId]
  );

  const refreshContext = useCallback(
    async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const { data, error } =
          await supabase.rpc(
            "get_my_context"
          );

        if (error) {
          throw error;
        }

        const context =
          data as MyContextResponse | null;

        const nextProfile =
          context?.profile ?? null;

        const nextOrganizations =
          Array.isArray(
            context?.organizations
          )
            ? context.organizations
            : [];

        setProfile(nextProfile);
        setOrganizations(
          nextOrganizations
        );

        const storedOrganizationId =
          await AsyncStorage.getItem(
            organizationStorageKey
          );

        let nextOrganization:
          | OrganizationContextItem
          | null = null;

        if (storedOrganizationId) {
          nextOrganization =
            nextOrganizations.find(
              (organization) =>
                organization.id ===
                storedOrganizationId
            ) ?? null;
        }

        /*
         * Se houver somente uma organização,
         * não obrigamos o usuário a escolhê-la.
         */
        if (
          !nextOrganization &&
          nextOrganizations.length === 1
        ) {
          nextOrganization =
            nextOrganizations[0];
        }

        setActiveOrganization(
          nextOrganization
        );

        if (!nextOrganization) {
          setActiveUnit(null);
          return;
        }

        await AsyncStorage.setItem(
          organizationStorageKey,
          nextOrganization.id
        );

        const storedUnitId =
          await AsyncStorage.getItem(
            unitStorageKey(
              nextOrganization.id
            )
          );

        const nextUnit =
          nextOrganization.units.find(
            (unit) =>
              unit.id === storedUnitId
          ) ??
          getDefaultUnit(
            nextOrganization
          );

        setActiveUnit(nextUnit);

        if (nextUnit) {
          await AsyncStorage.setItem(
            unitStorageKey(
              nextOrganization.id
            ),
            nextUnit.id
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o contexto da sua conta.";

        setErrorMessage(message);

        setProfile(null);
        setOrganizations([]);
        setActiveOrganization(null);
        setActiveUnit(null);
      } finally {
        setLoading(false);
      }
    },
    [
      organizationStorageKey,
      unitStorageKey,
    ]
  );

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  const selectOrganization =
    useCallback(
      async (
        organizationId: string
      ) => {
        const organization =
          organizations.find(
            (item) =>
              item.id ===
              organizationId
          );

        if (!organization) {
          throw new Error(
            "Organização não encontrada."
          );
        }

        setActiveOrganization(
          organization
        );

        await AsyncStorage.setItem(
          organizationStorageKey,
          organization.id
        );

        const storedUnitId =
          await AsyncStorage.getItem(
            unitStorageKey(
              organization.id
            )
          );

        const unit =
          organization.units.find(
            (item) =>
              item.id === storedUnitId
          ) ??
          getDefaultUnit(organization);

        setActiveUnit(unit);

        if (unit) {
          await AsyncStorage.setItem(
            unitStorageKey(
              organization.id
            ),
            unit.id
          );
        }
      },
      [
        organizations,
        organizationStorageKey,
        unitStorageKey,
      ]
    );

  const selectUnit = useCallback(
    async (unitId: string) => {
      if (!activeOrganization) {
        throw new Error(
          "Nenhuma organização ativa."
        );
      }

      const unit =
        activeOrganization.units.find(
          (item) => item.id === unitId
        );

      if (!unit) {
        throw new Error(
          "Unidade não encontrada nesta organização."
        );
      }

      setActiveUnit(unit);

      await AsyncStorage.setItem(
        unitStorageKey(
          activeOrganization.id
        ),
        unit.id
      );
    },
    [
      activeOrganization,
      unitStorageKey,
    ]
  );

  const clearOrganizationSelection =
    useCallback(async () => {
      setActiveOrganization(null);
      setActiveUnit(null);

      await AsyncStorage.removeItem(
        organizationStorageKey
      );
    }, [organizationStorageKey]);

  const permissions =
    activeOrganization?.permissions ?? [];

  const value = useMemo(
    () => ({
      profile,
      organizations,
      activeOrganization,
      activeUnit,
      permissions,
      loading,
      errorMessage,
      refreshContext,
      selectOrganization,
      selectUnit,
      clearOrganizationSelection,
    }),
    [
      profile,
      organizations,
      activeOrganization,
      activeUnit,
      permissions,
      loading,
      errorMessage,
      refreshContext,
      selectOrganization,
      selectUnit,
      clearOrganizationSelection,
    ]
  );

  return (
    <OrganizationContext.Provider
      value={value}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context =
    useContext(OrganizationContext);

  if (!context) {
    throw new Error(
      "useOrganization deve ser usado dentro de OrganizationProvider."
    );
  }

  return context;
}