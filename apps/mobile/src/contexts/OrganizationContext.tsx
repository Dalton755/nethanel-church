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

import {
  AppState,
} from "react-native";

import {
  supabase,
} from "../lib/supabase";

import type {
  AccessMatrixOrganization,
  MyAccessMatrixResponse,
  MyContextResponse,
  OrganizationContextItem,
  OrganizationProfile,
  OrganizationUnit,
} from "../features/organization/organization.types";


type OrganizationContextValue = {
  profile:
    OrganizationProfile | null;

  organizations:
    OrganizationContextItem[];

  activeOrganization:
    OrganizationContextItem | null;

  activeUnit:
    OrganizationUnit | null;

  /*
   * Permissões efetivas no contexto
   * da unidade ativa.
   *
   * Mantemos este campo para que as
   * telas existentes já passem a
   * respeitar a nova matriz sem
   * precisarmos alterá-las agora.
   */
  permissions: string[];

  /*
   * Permissões efetivamente concedidas
   * em nível de organização.
   */
  organizationPermissions: string[];

  loading: boolean;

  errorMessage:
    string | null;

  /*
   * Verifica a permissão no contexto
   * da unidade ativa ou da unidade
   * informada.
   */
  can: (
    permissionKey: string,
    unitId?: string
  ) => boolean;

  /*
   * Verifica exclusivamente uma
   * permissão administrativa global.
   */
  canAtOrganization: (
    permissionKey: string
  ) => boolean;

  refreshContext:
    (options?: {
      silent?: boolean;
    }) => Promise<void>;

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
  createContext<
    OrganizationContextValue | null
  >(null);


type OrganizationProviderProps = {
  userId: string;
  children: ReactNode;
};


function getDefaultUnit(
  organization:
    OrganizationContextItem
) {
  return (
    organization.units.find(
      (unit) =>
        unit.is_headquarters
    ) ??
    organization.units[0] ??
    null
  );
}


export function OrganizationProvider({
  userId,
  children,
}: OrganizationProviderProps) {
  const [
    profile,
    setProfile,
  ] =
    useState<
      OrganizationProfile | null
    >(null);


  const [
    organizations,
    setOrganizations,
  ] =
    useState<
      OrganizationContextItem[]
    >([]);


  const [
    activeOrganization,
    setActiveOrganization,
  ] =
    useState<
      OrganizationContextItem | null
    >(null);


  const [
    activeUnit,
    setActiveUnit,
  ] =
    useState<
      OrganizationUnit | null
    >(null);


  const [
    accessMatrix,
    setAccessMatrix,
  ] =
    useState<MyAccessMatrixResponse>({
      organizations: [],
    });


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<
      string | null
    >(null);


  const organizationStorageKey =
    `@nethanel/active-organization/${userId}`;


  const unitStorageKey =
    useCallback(
      (
        organizationId:
          string
      ) =>
        `@nethanel/active-unit/${userId}/${organizationId}`,
      [userId]
    );


  const refreshContext =
    useCallback(
      async (
        options?: {
          silent?: boolean;
        }
      ) => {
        const silent =
          options?.silent ??
          false;

        /*
         * Um refresh disparado ao voltar de
         * câmera, galeria, navegador ou outro
         * app não pode desmontar a navegação.
         *
         * Se loading=true aqui, AuthenticatedScreen
         * troca MainTabs pela tela de loading e
         * destrói formulários em andamento.
         */
        if (!silent) {
          setLoading(true);

          setErrorMessage(
            null
          );
        }

        try {
          /*
           * Carregamos identidade/contexto
           * e autorização em paralelo.
           */
          const [
            contextResult,
            accessResult,
          ] =
            await Promise.all([
              supabase.rpc(
                "get_my_context"
              ),

              supabase.rpc(
                "get_my_access_matrix"
              ),
            ]);


          if (
            contextResult.error
          ) {
            throw contextResult.error;
          }


          if (
            accessResult.error
          ) {
            throw accessResult.error;
          }


          const context =
            contextResult.data as
              | MyContextResponse
              | null;


          const matrix =
            accessResult.data as
              | MyAccessMatrixResponse
              | null;


          const nextProfile =
            context?.profile ??
            null;


          const nextOrganizations =
            Array.isArray(
              context?.organizations
            )
              ? context.organizations
              : [];


          const nextAccessMatrix:
            MyAccessMatrixResponse =
              matrix &&
              Array.isArray(
                matrix.organizations
              )
                ? matrix
                : {
                    organizations: [],
                  };


          setProfile(
            nextProfile
          );

          setOrganizations(
            nextOrganizations
          );

          setAccessMatrix(
            nextAccessMatrix
          );


          const storedOrganizationId =
            await AsyncStorage.getItem(
              organizationStorageKey
            );


          let nextOrganization:
            | OrganizationContextItem
            | null =
              null;


          if (
            storedOrganizationId
          ) {
            nextOrganization =
              nextOrganizations.find(
                (
                  organization
                ) =>
                  organization.id ===
                  storedOrganizationId
              ) ??
              null;
          }


          /*
           * Se só existe uma igreja,
           * selecionamos automaticamente.
           */
          if (
            !nextOrganization &&
            nextOrganizations.length ===
              1
          ) {
            nextOrganization =
              nextOrganizations[0];
          }


          setActiveOrganization(
            nextOrganization
          );


          if (
            !nextOrganization
          ) {
            setActiveUnit(
              null
            );

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
                unit.id ===
                storedUnitId
            ) ??
            getDefaultUnit(
              nextOrganization
            );


          setActiveUnit(
            nextUnit
          );


          if (nextUnit) {
            await AsyncStorage.setItem(
              unitStorageKey(
                nextOrganization.id
              ),
              nextUnit.id
            );
          }
        } catch (error) {
          /*
           * Em atualização silenciosa (por exemplo,
           * retorno do seletor de fotos) preservamos
           * o contexto atual diante de uma falha
           * transitória. O backend continua sendo
           * autoritativo para qualquer ação.
           */
          if (silent) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o contexto da sua conta.";


          setErrorMessage(
            message
          );


          setProfile(
            null
          );

          setOrganizations(
            []
          );

          setActiveOrganization(
            null
          );

          setActiveUnit(
            null
          );

          /*
           * Falha fechada:
           * se não conseguimos calcular
           * autorização, nenhuma permissão
           * é concedida.
           */
          setAccessMatrix({
            organizations: [],
          });
        } finally {
          if (!silent) {
            setLoading(
              false
            );
          }
        }
      },
      [
        organizationStorageKey,
        unitStorageKey,
      ]
    );


  /*
   * Carregamento inicial.
   */
  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);


  /*
   * Se um administrador alterar as
   * permissões enquanto o usuário está
   * fora do app, ao voltar ao aplicativo
   * o contexto é recalculado.
   *
   * O backend continua sendo a camada
   * autoritativa mesmo antes deste refresh.
   */
  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        "change",
        (state) => {
          if (
            state === "active"
          ) {
            void refreshContext({
              silent: true,
            });
          }
        }
      );


    return () => {
      subscription.remove();
    };
  }, [refreshContext]);


  const selectOrganization =
    useCallback(
      async (
        organizationId:
          string
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
              item.id ===
              storedUnitId
          ) ??
          getDefaultUnit(
            organization
          );


        setActiveUnit(
          unit
        );


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


  const selectUnit =
    useCallback(
      async (
        unitId:
          string
      ) => {
        if (
          !activeOrganization
        ) {
          throw new Error(
            "Nenhuma organização ativa."
          );
        }


        const unit =
          activeOrganization.units.find(
            (item) =>
              item.id ===
              unitId
          );


        if (!unit) {
          throw new Error(
            "Unidade não encontrada nesta organização."
          );
        }


        setActiveUnit(
          unit
        );


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
    useCallback(
      async () => {
        setActiveOrganization(
          null
        );

        setActiveUnit(
          null
        );


        await AsyncStorage.removeItem(
          organizationStorageKey
        );
      },
      [
        organizationStorageKey,
      ]
    );


  /*
   * Entrada da matriz correspondente
   * à organização atualmente ativa.
   */
  const activeAccess =
    useMemo<
      AccessMatrixOrganization | null
    >(
      () => {
        if (
          !activeOrganization
        ) {
          return null;
        }


        return (
          accessMatrix.organizations.find(
            (item) =>
              item.organization_id ===
              activeOrganization.id
          ) ??
          null
        );
      },
      [
        accessMatrix,
        activeOrganization,
      ]
    );


  /*
   * Permissões que realmente valem
   * para a organização inteira.
   */
  const organizationPermissions =
    useMemo(
      () =>
        activeAccess
          ?.organization_permissions ??
        [],
      [
        activeAccess,
      ]
    );


  /*
   * Permissões efetivas na unidade ativa.
   *
   * É este campo que substitui a antiga
   * lista genérica de get_my_context().
   */
  const permissions =
    useMemo(
      () => {
        if (
          !activeAccess
        ) {
          return [];
        }


        if (!activeUnit) {
          return (
            activeAccess
              .organization_permissions
          );
        }


        return (
          activeAccess.units.find(
            (item) =>
              item.unit_id ===
              activeUnit.id
          )?.permissions ??
          []
        );
      },
      [
        activeAccess,
        activeUnit,
      ]
    );


  const can =
    useCallback(
      (
        permissionKey:
          string,

        unitId?: string
      ) => {
        if (
          !activeAccess
        ) {
          return false;
        }


        const targetUnitId =
          unitId ??
          activeUnit?.id ??
          null;


        if (
          !targetUnitId
        ) {
          return (
            activeAccess
              .organization_permissions
              .includes(
                permissionKey
              )
          );
        }


        const unitAccess =
          activeAccess.units.find(
            (item) =>
              item.unit_id ===
              targetUnitId
          );


        return (
          unitAccess
            ?.permissions
            .includes(
              permissionKey
            ) ??
          false
        );
      },
      [
        activeAccess,
        activeUnit,
      ]
    );


  const canAtOrganization =
    useCallback(
      (
        permissionKey:
          string
      ) =>
        activeAccess
          ?.organization_permissions
          .includes(
            permissionKey
          ) ??
        false,
      [
        activeAccess,
      ]
    );


  const value =
    useMemo(
      () => ({
        profile,
        organizations,
        activeOrganization,
        activeUnit,

        permissions,
        organizationPermissions,

        loading,
        errorMessage,

        can,
        canAtOrganization,

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
        organizationPermissions,

        loading,
        errorMessage,

        can,
        canAtOrganization,

        refreshContext,
        selectOrganization,
        selectUnit,
        clearOrganizationSelection,
      ]
    );


  return (
    <OrganizationContext.Provider
      value={
        value
      }
    >
      {children}
    </OrganizationContext.Provider>
  );
}


export function useOrganization() {
  const context =
    useContext(
      OrganizationContext
    );


  if (!context) {
    throw new Error(
      "useOrganization deve ser usado dentro de OrganizationProvider."
    );
  }


  return context;
}