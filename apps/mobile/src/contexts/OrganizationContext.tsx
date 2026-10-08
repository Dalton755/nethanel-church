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
import { AppState } from "react-native";
import Constants from "expo-constants";

import { supabase } from "../lib/supabase";
import type {
  AccessMatrixOrganization,
  MyAccessMatrixResponse,
  MyBrandingContextResponse,
  MyContextResponse,
  OrganizationContextItem,
  OrganizationProfile,
  OrganizationUnit,
} from "../features/organization/organization.types";

export type OrganizationPlanFeatureValue =
  | boolean
  | string
  | number
  | null;

export type OrganizationPlanContext = {
  organization_id: string;
  is_blessed: boolean;
  is_trial: boolean;
  trial_ends_at: string | null;
  subscription_status: string;
  billing_plan_code: string;
  effective_plan_code: string;
  price_cents: number | null;
  name: string;
  base_plan_name: string;
  limits: Record<string, number | null>;
  features: Record<string, OrganizationPlanFeatureValue>;
  usage: Record<string, number>;
};

type OrganizationContextValue = {
  profile: OrganizationProfile | null;
  organizations: OrganizationContextItem[];
  activeOrganization: OrganizationContextItem | null;
  activeUnit: OrganizationUnit | null;
  planContext: OrganizationPlanContext | null;
  planFeatures: Record<string, OrganizationPlanFeatureValue>;
  permissions: string[];
  organizationPermissions: string[];
  loading: boolean;
  errorMessage: string | null;
  can: (permissionKey: string, unitId?: string) => boolean;
  canAtOrganization: (permissionKey: string) => boolean;
  hasPlanFeature: (featureKey: string) => boolean;
  planFeature: (featureKey: string) => OrganizationPlanFeatureValue;
  refreshContext: (options?: { silent?: boolean }) => Promise<void>;
  selectOrganization: (organizationId: string) => Promise<void>;
  selectUnit: (unitId: string) => Promise<void>;
  clearOrganizationSelection: () => Promise<void>;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

// APK exclusivo fica vinculado à igreja que o contratou.
const fixedOrganizationId: string | null =
  typeof Constants.expoConfig?.extra?.eloOrganizationId === "string"
    ? Constants.expoConfig.extra.eloOrganizationId : null;

type OrganizationProviderProps = {
  userId: string;
  children: ReactNode;
};

function getDefaultUnit(organization: OrganizationContextItem) {
  return (
    organization.units.find((unit) => unit.is_headquarters) ??
    organization.units[0] ??
    null
  );
}

function mergeBranding(
  organizations: OrganizationContextItem[],
  brandingContext: MyBrandingContextResponse | null
): OrganizationContextItem[] {
  const brandingMap = new Map(
    (brandingContext?.organizations ?? []).map((branding) => [
      branding.organization_id,
      branding,
    ])
  );

  return organizations.map((organization) => {
    const branding = brandingMap.get(organization.id);

    return {
      ...organization,
      app_name:
        branding?.app_name ?? organization.app_name ?? organization.name,
      logo_url: branding?.logo_url ?? organization.logo_url ?? null,
      app_icon_url:
        branding?.app_icon_url ?? organization.app_icon_url ?? null,
      splash_url: branding?.splash_url ?? organization.splash_url ?? null,
      primary_color:
        branding?.primary_color ?? organization.primary_color ?? "#2387C9",
      secondary_color:
        branding?.secondary_color ??
        organization.secondary_color ??
        "#DCE9F3",
      background_color:
        branding?.background_color ??
        organization.background_color ??
        "#F6F8FB",
      white_label_enabled:
        branding?.white_label_enabled ??
        organization.white_label_enabled ??
        false,
      custom_domain:
        branding?.custom_domain ?? organization.custom_domain ?? null,
    };
  });
}

export function OrganizationProvider({
  userId,
  children,
}: OrganizationProviderProps) {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationContextItem[]>([]);
  const [activeOrganization, setActiveOrganization] =
    useState<OrganizationContextItem | null>(null);
  const [activeUnit, setActiveUnit] = useState<OrganizationUnit | null>(null);
  const [planContext, setPlanContext] =
    useState<OrganizationPlanContext | null>(null);
  const [accessMatrix, setAccessMatrix] = useState<MyAccessMatrixResponse>({
    organizations: [],
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const organizationStorageKey = `@nethanel/active-organization/${userId}`;
  const unitStorageKey = useCallback(
    (organizationId: string) =>
      `@nethanel/active-unit/${userId}/${organizationId}`,
    [userId]
  );

  const loadPlanContext = useCallback(async (organizationId: string) => {
    const { data, error } = await supabase.rpc("get_organization_plan_context", {
      p_organization_id: organizationId,
    });

    if (error) {
      setPlanContext(null);
      return null;
    }

    const nextPlanContext = data as OrganizationPlanContext | null;
    setPlanContext(nextPlanContext);
    return nextPlanContext;
  }, []);

  const refreshContext = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (!silent) {
        setLoading(true);
        setErrorMessage(null);
      }

      try {
        const [contextResult, accessResult, brandingResult] = await Promise.all([
          supabase.rpc("get_my_context"),
          supabase.rpc("get_my_access_matrix"),
          supabase.rpc("get_my_branding_context"),
        ]);

        if (contextResult.error) throw contextResult.error;
        if (accessResult.error) throw accessResult.error;

        const context = contextResult.data as MyContextResponse | null;
        const matrix = accessResult.data as MyAccessMatrixResponse | null;
        const brandingContext = brandingResult.error
          ? null
          : (brandingResult.data as MyBrandingContextResponse | null);

        const nextProfile = context?.profile ?? null;
        const rawOrganizations = Array.isArray(context?.organizations)
          ? context.organizations.filter(
              (org) => !fixedOrganizationId || org.id === fixedOrganizationId
            )
          : [];
        const nextOrganizations = mergeBranding(
          rawOrganizations,
          brandingContext
        );
        const nextAccessMatrix: MyAccessMatrixResponse =
          matrix && Array.isArray(matrix.organizations)
            ? matrix
            : { organizations: [] };

        setProfile(nextProfile);
        setOrganizations(nextOrganizations);
        setAccessMatrix(nextAccessMatrix);

        const storedOrganizationId = await AsyncStorage.getItem(
          organizationStorageKey
        );

        let nextOrganization: OrganizationContextItem | null = null;

        if (storedOrganizationId) {
          nextOrganization =
            nextOrganizations.find(
              (organization) => organization.id === storedOrganizationId
            ) ?? null;
        }

        if (!nextOrganization && nextOrganizations.length === 1) {
          nextOrganization = nextOrganizations[0];
        }

        setActiveOrganization(nextOrganization);

        if (!nextOrganization) {
          setActiveUnit(null);
          setPlanContext(null);
          return;
        }

        await Promise.all([
          AsyncStorage.setItem(organizationStorageKey, nextOrganization.id),
          loadPlanContext(nextOrganization.id),
        ]);

        const storedUnitId = await AsyncStorage.getItem(
          unitStorageKey(nextOrganization.id)
        );

        const nextUnit =
          nextOrganization.units.find((unit) => unit.id === storedUnitId) ??
          getDefaultUnit(nextOrganization);

        setActiveUnit(nextUnit);

        if (nextUnit) {
          await AsyncStorage.setItem(
            unitStorageKey(nextOrganization.id),
            nextUnit.id
          );
        }
      } catch (error) {
        if (silent) return;

        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o contexto da sua conta.";

        setErrorMessage(message);
        setProfile(null);
        setOrganizations([]);
        setActiveOrganization(null);
        setActiveUnit(null);
        setPlanContext(null);
        setAccessMatrix({ organizations: [] });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [organizationStorageKey, unitStorageKey, loadPlanContext]
  );

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshContext({ silent: true });
      }
    });

    return () => subscription.remove();
  }, [refreshContext]);

  const selectOrganization = useCallback(
    async (organizationId: string) => {
      if (fixedOrganizationId && fixedOrganizationId !== organizationId) {
        throw new Error("Este aplicativo é exclusivo de outra igreja.");
      }
      const organization = organizations.find(
        (item) => item.id === organizationId
      );

      if (!organization) {
        throw new Error("Organização não encontrada.");
      }

      setActiveOrganization(organization);
      await Promise.all([
        AsyncStorage.setItem(organizationStorageKey, organization.id),
        loadPlanContext(organization.id),
      ]);

      const storedUnitId = await AsyncStorage.getItem(
        unitStorageKey(organization.id)
      );
      const unit =
        organization.units.find((item) => item.id === storedUnitId) ??
        getDefaultUnit(organization);

      setActiveUnit(unit);

      if (unit) {
        await AsyncStorage.setItem(unitStorageKey(organization.id), unit.id);
      }
    },
    [organizations, organizationStorageKey, unitStorageKey, loadPlanContext]
  );

  const selectUnit = useCallback(
    async (unitId: string) => {
      if (!activeOrganization) {
        throw new Error("Nenhuma organização ativa.");
      }

      const unit = activeOrganization.units.find((item) => item.id === unitId);

      if (!unit) {
        throw new Error("Unidade não encontrada nesta organização.");
      }

      setActiveUnit(unit);
      await AsyncStorage.setItem(
        unitStorageKey(activeOrganization.id),
        unit.id
      );
    },
    [activeOrganization, unitStorageKey]
  );

  const clearOrganizationSelection = useCallback(async () => {
    setActiveOrganization(null);
    setActiveUnit(null);
    setPlanContext(null);
    await AsyncStorage.removeItem(organizationStorageKey);
  }, [organizationStorageKey]);

  const activeAccess = useMemo<AccessMatrixOrganization | null>(() => {
    if (!activeOrganization) return null;

    return (
      accessMatrix.organizations.find(
        (item) => item.organization_id === activeOrganization.id
      ) ?? null
    );
  }, [accessMatrix, activeOrganization]);

  const organizationPermissions = useMemo(
    () => activeAccess?.organization_permissions ?? [],
    [activeAccess]
  );

  const permissions = useMemo(() => {
    if (!activeAccess) return [];
    if (!activeUnit) return activeAccess.organization_permissions;

    return (
      activeAccess.units.find((item) => item.unit_id === activeUnit.id)
        ?.permissions ?? []
    );
  }, [activeAccess, activeUnit]);

  const planFeatures = useMemo(
    () => planContext?.features ?? {},
    [planContext]
  );

  const planFeature = useCallback(
    (featureKey: string) => planFeatures[featureKey] ?? null,
    [planFeatures]
  );

  const hasPlanFeature = useCallback(
    (featureKey: string) => planFeatures[featureKey] === true,
    [planFeatures]
  );

  const can = useCallback(
    (permissionKey: string, unitId?: string) => {
      if (!activeAccess) return false;

      const targetUnitId = unitId ?? activeUnit?.id ?? null;

      if (!targetUnitId) {
        return activeAccess.organization_permissions.includes(permissionKey);
      }

      return (
        activeAccess.units
          .find((item) => item.unit_id === targetUnitId)
          ?.permissions.includes(permissionKey) ?? false
      );
    },
    [activeAccess, activeUnit]
  );

  const canAtOrganization = useCallback(
    (permissionKey: string) =>
      activeAccess?.organization_permissions.includes(permissionKey) ?? false,
    [activeAccess]
  );

  const value = useMemo(
    () => ({
      profile,
      organizations,
      activeOrganization,
      activeUnit,
      planContext,
      planFeatures,
      permissions,
      organizationPermissions,
      loading,
      errorMessage,
      can,
      canAtOrganization,
      hasPlanFeature,
      planFeature,
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
      planContext,
      planFeatures,
      permissions,
      organizationPermissions,
      loading,
      errorMessage,
      can,
      canAtOrganization,
      hasPlanFeature,
      planFeature,
      refreshContext,
      selectOrganization,
      selectUnit,
      clearOrganizationSelection,
    ]
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);

  if (!context) {
    throw new Error(
      "useOrganization deve ser usado dentro de OrganizationProvider."
    );
  }

  return context;
}
