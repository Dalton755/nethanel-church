import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  Ionicons,
} from "@expo/vector-icons";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  useOrganization,
} from "../../contexts/OrganizationContext";

import {
  supabase,
} from "../../lib/supabase";


type PermissionScope =
  | "organization"
  | "unit";


type PermissionItem = {
  permission_key: string;
  description: string;
  permission_scope: PermissionScope;
};


type AccessRole = {
  id: string;
  name: string;
  role_key: string;
  description: string | null;

  is_owner: boolean;
  is_system: boolean;
  is_active: boolean;

  assigned_count: number;

  permissions: string[];
};


type AccessRolesResponse = {
  roles: AccessRole[];
  permissions: PermissionItem[];
};


type AccessRolesScreenProps = {
  onBack: () => void;
};


type PermissionGroup = {
  title: string;
  icon:
    keyof typeof Ionicons.glyphMap;

  permissionKeys: string[];
};


const PERMISSION_LABELS:
  Record<string, string> = {
    "people.view":
      "Consultar pessoas",

    "people.manage":
      "Cadastrar e editar pessoas",

    "agenda.view":
      "Consultar agenda",

    "agenda.manage":
      "Criar e editar eventos",

    "services.view":
      "Consultar cultos",

    "services.manage":
      "Criar e editar cultos",

    "units.manage":
      "Gerenciar unidades e congregações",

    "organization.manage":
      "Gerenciar configurações da igreja",

    "security.manage":
      "Gerenciar acessos e perfis",

    "audit.view":
      "Consultar histórico administrativo",
  };


const PERMISSION_GROUPS:
  PermissionGroup[] = [
    {
      title: "Pessoas",
      icon: "people-outline",

      permissionKeys: [
        "people.view",
        "people.manage",
      ],
    },

    {
      title: "Agenda",
      icon: "calendar-outline",

      permissionKeys: [
        "agenda.view",
        "agenda.manage",
      ],
    },

    {
      title: "Cultos",
      icon: "book-outline",

      permissionKeys: [
        "services.view",
        "services.manage",
      ],
    },

    {
      title: "Estrutura da igreja",
      icon: "business-outline",

      permissionKeys: [
        "units.manage",
        "organization.manage",
      ],
    },

    {
      title: "Administração",
      icon: "shield-checkmark-outline",

      permissionKeys: [
        "security.manage",
        "audit.view",
      ],
    },
  ];


function getErrorMessage(
  error: unknown
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    const message =
      String(
        (
          error as {
            message: unknown;
          }
        ).message
      );


    if (
      message.includes(
        "roles_org_name_ci_uq"
      ) ||
      message.includes(
        "duplicate key"
      )
    ) {
      return "Já existe um perfil com esse nome.";
    }


    if (
      message.includes(
        "Insufficient security permission"
      )
    ) {
      return "Você não possui permissão para administrar perfis de acesso.";
    }


    return message;
  }


  return "Não foi possível concluir a operação.";
}


export function AccessRolesScreen({
  onBack,
}: AccessRolesScreenProps) {
  const {
    activeOrganization,
    canAtOrganization,
    refreshContext,
  } =
    useOrganization();


  const [
    roles,
    setRoles,
  ] =
    useState<
      AccessRole[]
    >([]);


  const [
    permissions,
    setPermissions,
  ] =
    useState<
      PermissionItem[]
    >([]);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    editorRole,
    setEditorRole,
  ] =
    useState<
      AccessRole | null | undefined
    >(undefined);


  const canManageSecurity =
    canAtOrganization(
      "security.manage"
    );


  const loadRoles =
    useCallback(
      async () => {
        if (
          !activeOrganization
        ) {
          return;
        }


        setLoading(
          true
        );


        try {
          const {
            data,
            error,
          } =
            await supabase.rpc(
              "list_access_roles",
              {
                p_organization_id:
                  activeOrganization.id,
              }
            );


          if (error) {
            throw error;
          }


          const response =
            data as
              | AccessRolesResponse
              | null;


          setRoles(
            Array.isArray(
              response?.roles
            )
              ? response.roles
              : []
          );


          setPermissions(
            Array.isArray(
              response?.permissions
            )
              ? response.permissions
              : []
          );
        } catch (error) {
          Alert.alert(
            "Perfis de acesso",
            getErrorMessage(
              error
            )
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        activeOrganization,
      ]
    );


  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);


  async function handleToggleRole(
    role: AccessRole,
    active: boolean
  ) {
    if (
      !activeOrganization
    ) {
      return;
    }


    const action =
      active
        ? "ativar"
        : "desativar";


    Alert.alert(
      active
        ? "Ativar perfil"
        : "Desativar perfil",

      `Deseja ${action} o perfil "${role.name}"?`,

      [
        {
          text: "Cancelar",
          style: "cancel",
        },

        {
          text:
            active
              ? "Ativar"
              : "Desativar",

          style:
            active
              ? "default"
              : "destructive",

          onPress: () => {
            void (async () => {
              try {
                const {
                  error,
                } =
                  await supabase.rpc(
                    "set_access_role_active",
                    {
                      p_organization_id:
                        activeOrganization.id,

                      p_role_id:
                        role.id,

                      p_active:
                        active,
                    }
                  );


                if (error) {
                  throw error;
                }


                await Promise.all([
                  loadRoles(),
                  refreshContext(),
                ]);
              } catch (error) {
                Alert.alert(
                  "Não foi possível alterar o perfil",
                  getErrorMessage(
                    error
                  )
                );
              }
            })();
          },
        },
      ]
    );
  }


  if (
    editorRole !== undefined
  ) {
    return (
      <RoleEditor
        organizationId={
          activeOrganization?.id ??
          ""
        }

        role={
          editorRole
        }

        permissions={
          permissions
        }

        onBack={() =>
          setEditorRole(
            undefined
          )
        }

        onSaved={async () => {
          setEditorRole(
            undefined
          );

          await Promise.all([
            loadRoles(),
            refreshContext(),
          ]);
        }}
      />
    );
  }


  if (
    !canManageSecurity
  ) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={
          styles.safeArea
        }
      >
        <View
          style={
            styles.deniedContent
          }
        >
          <Ionicons
            name="lock-closed-outline"
            size={30}
            color="#555555"
          />

          <Text
            style={
              styles.deniedTitle
            }
          >
            Acesso indisponível
          </Text>

          <Text
            style={
              styles.deniedText
            }
          >
            Você não possui permissão para administrar perfis de acesso.
          </Text>

          <Pressable
            onPress={
              onBack
            }
            style={
              styles.primaryButton
            }
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Voltar
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView
      edges={["top"]}
      style={
        styles.safeArea
      }
    >
      <View
        style={
          styles.screen
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          <Pressable
            onPress={
              onBack
            }
            style={
              styles.back
            }
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color="#333333"
            />

            <Text
              style={
                styles.backText
              }
            >
              Gestão da Igreja
            </Text>
          </Pressable>


          <View
            style={
              styles.heading
            }
          >
            <Text
              style={
                styles.title
              }
            >
              Perfis de acesso
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Defina o que cada perfil pode visualizar e administrar no aplicativo.
            </Text>
          </View>


          {loading ? (
            <View
              style={
                styles.loading
              }
            >
              <ActivityIndicator />

              <Text
                style={
                  styles.loadingText
                }
              >
                Carregando perfis...
              </Text>
            </View>
          ) : (
            <View
              style={
                styles.roles
              }
            >
              {roles.map(
                (role) => (
                  <View
                    key={
                      role.id
                    }
                    style={[
                      styles.roleCard,

                      !role.is_active &&
                        styles.roleCardInactive,
                    ]}
                  >
                    <Pressable
                      disabled={
                        role.is_owner ||
                        role.is_system
                      }
                      onPress={() =>
                        setEditorRole(
                          role
                        )
                      }
                      style={
                        styles.roleMain
                      }
                    >
                      <View
                        style={
                          styles.roleIcon
                        }
                      >
                        <Ionicons
                          name={
                            role.is_owner
                              ? "shield-checkmark"
                              : "person-circle-outline"
                          }
                          size={23}
                          color="#444444"
                        />
                      </View>


                      <View
                        style={
                          styles.roleInfo
                        }
                      >
                        <View
                          style={
                            styles.roleTitleRow
                          }
                        >
                          <Text
                            style={
                              styles.roleName
                            }
                          >
                            {
                              role.name
                            }
                          </Text>

                          {role.is_owner && (
                            <Text
                              style={
                                styles.protectedBadge
                              }
                            >
                              Protegido
                            </Text>
                          )}

                          {!role.is_active && (
                            <Text
                              style={
                                styles.inactiveBadge
                              }
                            >
                              Inativo
                            </Text>
                          )}
                        </View>


                        {role.description ? (
                          <Text
                            numberOfLines={
                              2
                            }
                            style={
                              styles.roleDescription
                            }
                          >
                            {
                              role.description
                            }
                          </Text>
                        ) : null}


                        <Text
                          style={
                            styles.roleMeta
                          }
                        >
                          {role.is_owner
                            ? "Acesso total"
                            : `${role.permissions.length} permissões`}

                          {" • "}

                          {role.assigned_count ===
                          1
                            ? "1 pessoa"
                            : `${role.assigned_count} pessoas`}
                        </Text>
                      </View>


                      {!role.is_owner &&
                        !role.is_system && (
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color="#aaaaaa"
                          />
                        )}
                    </Pressable>


                    {!role.is_owner &&
                      !role.is_system && (
                        <View
                          style={
                            styles.roleStatus
                          }
                        >
                          <Text
                            style={
                              styles.roleStatusText
                            }
                          >
                            {
                              role.is_active
                                ? "Ativo"
                                : "Inativo"
                            }
                          </Text>

                          <Switch
                            value={
                              role.is_active
                            }
                            onValueChange={(
                              value
                            ) =>
                              handleToggleRole(
                                role,
                                value
                              )
                            }
                          />
                        </View>
                      )}
                  </View>
                )
              )}
            </View>
          )}


          <View
            style={
              styles.infoBox
            }
          >
            <Ionicons
              name="information-circle-outline"
              size={19}
              color="#555555"
            />

            <Text
              style={
                styles.infoText
              }
            >
              As permissões definem o que o perfil pode fazer. Depois você poderá escolher quais pessoas receberão cada perfil.
            </Text>
          </View>
        </ScrollView>


        <View
          style={
            styles.footer
          }
        >
          <Pressable
            onPress={() =>
              setEditorRole(
                null
              )
            }
            style={
              styles.primaryButton
            }
          >
            <Ionicons
              name="add"
              size={20}
              color="#ffffff"
            />

            <Text
              style={
                styles.primaryButtonText
              }
            >
              Novo perfil
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}


type RoleEditorProps = {
  organizationId: string;

  role:
    AccessRole | null;

  permissions:
    PermissionItem[];

  onBack:
    () => void;

  onSaved:
    () => Promise<void>;
};


function RoleEditor({
  organizationId,
  role,
  permissions,
  onBack,
  onSaved,
}: RoleEditorProps) {
  const [
    name,
    setName,
  ] =
    useState(
      role?.name ??
      ""
    );


  const [
    description,
    setDescription,
  ] =
    useState(
      role?.description ??
      ""
    );


  const [
    selectedPermissions,
    setSelectedPermissions,
  ] =
    useState<
      string[]
    >(
      role?.permissions ??
      []
    );


  const [
    saving,
    setSaving,
  ] =
    useState(false);


  const permissionMap =
    useMemo(
      () =>
        new Map(
          permissions.map(
            (permission) => [
              permission.permission_key,
              permission,
            ]
          )
        ),
      [
        permissions,
      ]
    );


  function togglePermission(
    permissionKey: string
  ) {
    setSelectedPermissions(
      (current) =>
        current.includes(
          permissionKey
        )
          ? current.filter(
              (item) =>
                item !==
                permissionKey
            )
          : [
              ...current,
              permissionKey,
            ]
    );
  }


  async function handleSave() {
    const normalizedName =
      name.trim();


    if (
      normalizedName.length <
      2
    ) {
      Alert.alert(
        "Nome do perfil",
        "Informe um nome com pelo menos 2 caracteres."
      );

      return;
    }


    setSaving(
      true
    );


    try {
      const {
        error,
      } =
        await supabase.rpc(
          "save_access_role",
          {
            p_organization_id:
              organizationId,

            p_role_id:
              role?.id ??
              null,

            p_name:
              normalizedName,

            p_description:
              description.trim() ||
              null,

            p_permission_keys:
              selectedPermissions,
          }
        );


      if (error) {
        throw error;
      }


      await onSaved();
    } catch (error) {
      Alert.alert(
        "Não foi possível salvar",
        getErrorMessage(
          error
        )
      );
    } finally {
      setSaving(
        false
      );
    }
  }


  return (
    <SafeAreaView
      edges={["top"]}
      style={
        styles.safeArea
      }
    >
      <View
        style={
          styles.screen
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.editorContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <Pressable
            onPress={
              onBack
            }
            style={
              styles.back
            }
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color="#333333"
            />

            <Text
              style={
                styles.backText
              }
            >
              Perfis de acesso
            </Text>
          </Pressable>


          <View
            style={
              styles.heading
            }
          >
            <Text
              style={
                styles.title
              }
            >
              {role
                ? "Editar perfil"
                : "Novo perfil"}
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Escolha um nome simples e marque somente o que esse perfil precisa administrar.
            </Text>
          </View>


          <Text
            style={
              styles.fieldLabel
            }
          >
            Nome do perfil
          </Text>

          <TextInput
            value={
              name
            }
            onChangeText={
              setName
            }
            placeholder="Ex.: Secretaria"
            placeholderTextColor="#999999"
            style={
              styles.input
            }
          />


          <Text
            style={[
              styles.fieldLabel,
              styles.descriptionLabel,
            ]}
          >
            Descrição
          </Text>

          <TextInput
            value={
              description
            }
            onChangeText={
              setDescription
            }
            placeholder="Ex.: Responsável pelos cadastros e rotina administrativa."
            placeholderTextColor="#999999"
            multiline
            textAlignVertical="top"
            style={[
              styles.input,
              styles.textArea,
            ]}
          />


          <View
            style={
              styles.permissionsHeading
            }
          >
            <Text
              style={
                styles.permissionsTitle
              }
            >
              Permissões
            </Text>

            <Text
              style={
                styles.permissionsSubtitle
              }
            >
              {selectedPermissions.length ===
              1
                ? "1 permissão selecionada"
                : `${selectedPermissions.length} permissões selecionadas`}
            </Text>
          </View>


          {PERMISSION_GROUPS.map(
            (group) => {
              const groupPermissions =
                group.permissionKeys
                  .map(
                    (key) =>
                      permissionMap.get(
                        key
                      )
                  )
                  .filter(
                    (
                      item
                    ): item is PermissionItem =>
                      Boolean(
                        item
                      )
                  );


              if (
                groupPermissions.length ===
                0
              ) {
                return null;
              }


              return (
                <View
                  key={
                    group.title
                  }
                  style={
                    styles.permissionGroup
                  }
                >
                  <View
                    style={
                      styles.permissionGroupHeader
                    }
                  >
                    <View
                      style={
                        styles.permissionGroupIcon
                      }
                    >
                      <Ionicons
                        name={
                          group.icon
                        }
                        size={19}
                        color="#444444"
                      />
                    </View>

                    <Text
                      style={
                        styles.permissionGroupTitle
                      }
                    >
                      {
                        group.title
                      }
                    </Text>
                  </View>


                  {groupPermissions.map(
                    (
                      permission
                    ) => {
                      const selected =
                        selectedPermissions.includes(
                          permission.permission_key
                        );


                      return (
                        <Pressable
                          key={
                            permission.permission_key
                          }
                          onPress={() =>
                            togglePermission(
                              permission.permission_key
                            )
                          }
                          style={
                            styles.permissionRow
                          }
                        >
                          <View
                            style={
                              styles.permissionInfo
                            }
                          >
                            <Text
                              style={
                                styles.permissionLabel
                              }
                            >
                              {PERMISSION_LABELS[
                                permission.permission_key
                              ] ??
                                permission.description}
                            </Text>
                          </View>


                          <Switch
                            value={
                              selected
                            }
                            onValueChange={() =>
                              togglePermission(
                                permission.permission_key
                              )
                            }
                          />
                        </Pressable>
                      );
                    }
                  )}
                </View>
              );
            }
          )}


          <View
            style={
              styles.editorTip
            }
          >
            <Ionicons
              name="bulb-outline"
              size={18}
              color="#555555"
            />

            <Text
              style={
                styles.editorTipText
              }
            >
              O perfil define o que a pessoa pode fazer. Na área “Pessoas e acessos” definiremos onde esse acesso vale: toda a igreja ou somente uma unidade.
            </Text>
          </View>
        </ScrollView>


        <View
          style={
            styles.footer
          }
        >
          <Pressable
            disabled={
              saving
            }
            onPress={() =>
              void handleSave()
            }
            style={[
              styles.primaryButton,

              saving &&
                styles.buttonDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator
                color="#ffffff"
              />
            ) : (
              <>
                <Ionicons
                  name="checkmark"
                  size={20}
                  color="#ffffff"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Salvar perfil
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}


const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: "#f7f7f6",
    },

    screen: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 120,
    },

    editorContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 125,
    },

    back: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
    },

    backText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#333333",
    },

    heading: {
      paddingTop: 18,
      paddingBottom: 25,
    },

    title: {
      fontSize: 28,
      fontWeight: "700",
      color: "#111111",
    },

    subtitle: {
      marginTop: 8,
      maxWidth: 440,
      fontSize: 14,
      lineHeight: 21,
      color: "#727272",
    },

    loading: {
      paddingVertical: 45,
      alignItems: "center",
      gap: 12,
    },

    loadingText: {
      fontSize: 13,
      color: "#777777",
    },

    roles: {
      gap: 10,
    },

    roleCard: {
      borderWidth: 1,
      borderColor: "#e0e0dd",
      borderRadius: 14,
      backgroundColor: "#ffffff",
      overflow: "hidden",
    },

    roleCardInactive: {
      opacity: 0.67,
    },

    roleMain: {
      minHeight: 82,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },

    roleIcon: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: "#f0f0ed",
    },

    roleInfo: {
      flex: 1,
    },

    roleTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 7,
    },

    roleName: {
      fontSize: 15,
      fontWeight: "700",
      color: "#202020",
    },

    protectedBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: "#e9e9e6",
      fontSize: 10,
      fontWeight: "700",
      color: "#585858",
    },

    inactiveBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: "#f1eeee",
      fontSize: 10,
      fontWeight: "700",
      color: "#745f5f",
    },

    roleDescription: {
      marginTop: 5,
      fontSize: 12,
      lineHeight: 17,
      color: "#777777",
    },

    roleMeta: {
      marginTop: 5,
      fontSize: 11,
      fontWeight: "600",
      color: "#898989",
    },

    roleStatus: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: "#eeeeeb",
    },

    roleStatusText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#666666",
    },

    infoBox: {
      marginTop: 20,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      padding: 13,
      borderRadius: 12,
      backgroundColor: "#eeeeeb",
    },

    infoText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      color: "#5f5f5f",
    },

    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 14,
      borderTopWidth: 1,
      borderTopColor: "#e2e2df",
      backgroundColor: "#ffffff",
    },

    primaryButton: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: "#202020",
    },

    primaryButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#ffffff",
    },

    buttonDisabled: {
      opacity: 0.55,
    },

    fieldLabel: {
      marginBottom: 7,
      fontSize: 13,
      fontWeight: "700",
      color: "#333333",
    },

    descriptionLabel: {
      marginTop: 18,
    },

    input: {
      minHeight: 50,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "#ddddda",
      borderRadius: 12,
      backgroundColor: "#ffffff",
      fontSize: 14,
      color: "#202020",
    },

    textArea: {
      minHeight: 94,
      paddingTop: 13,
      paddingBottom: 13,
    },

    permissionsHeading: {
      marginTop: 27,
      marginBottom: 12,
    },

    permissionsTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: "#202020",
    },

    permissionsSubtitle: {
      marginTop: 4,
      fontSize: 12,
      color: "#777777",
    },

    permissionGroup: {
      marginBottom: 11,
      borderWidth: 1,
      borderColor: "#e1e1de",
      borderRadius: 14,
      backgroundColor: "#ffffff",
      overflow: "hidden",
    },

    permissionGroupHeader: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 13,
      backgroundColor: "#f1f1ee",
    },

    permissionGroupIcon: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
    },

    permissionGroupTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: "#333333",
    },

    permissionRow: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: "#eeeeeb",
    },

    permissionInfo: {
      flex: 1,
    },

    permissionLabel: {
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18,
      color: "#303030",
    },

    editorTip: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      padding: 13,
      borderRadius: 12,
      backgroundColor: "#eeeeeb",
    },

    editorTipText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      color: "#5f5f5f",
    },

    deniedContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 30,
    },

    deniedTitle: {
      marginTop: 13,
      fontSize: 18,
      fontWeight: "700",
      color: "#222222",
    },

    deniedText: {
      marginTop: 7,
      marginBottom: 22,
      maxWidth: 330,
      textAlign: "center",
      fontSize: 13,
      lineHeight: 19,
      color: "#777777",
    },
  });