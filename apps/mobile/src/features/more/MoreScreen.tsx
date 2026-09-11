import {
  useState,
} from "react";

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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

import {
  ChurchManagementScreen,
} from "../management/ChurchManagementScreen";


export function MoreScreen() {
  const {
    profile,
    organizations,
    activeOrganization,
    activeUnit,
    canAtOrganization,
    clearOrganizationSelection,
  } =
    useOrganization();


  const [
    showingManagement,
    setShowingManagement,
  ] =
    useState(false);


  const canOpenManagement =
    canAtOrganization(
      "security.manage"
    ) ||
    canAtOrganization(
      "organization.manage"
    ) ||
    canAtOrganization(
      "units.manage"
    ) ||
    canAtOrganization(
      "audit.view"
    );


  async function handleSignOut() {
    await supabase.auth.signOut();
  }


  if (
    showingManagement
  ) {
    return (
      <ChurchManagementScreen
        onBack={() =>
          setShowingManagement(
            false
          )
        }
      />
    );
  }


  return (
    <SafeAreaView
      edges={["top"]}
      style={
        styles.safeArea
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
        <Text
          style={
            styles.title
          }
        >
          Mais
        </Text>


        <View
          style={
            styles.account
          }
        >
          <View
            style={
              styles.accountIcon
            }
          >
            <Ionicons
              name="person-outline"
              size={22}
              color="#444444"
            />
          </View>


          <View
            style={
              styles.accountContent
            }
          >
            <Text
              style={
                styles.name
              }
            >
              {profile?.display_name ??
                "Usuário"}
            </Text>

            <Text
              style={
                styles.organization
              }
            >
              {
                activeOrganization
                  ?.name
              }
            </Text>

            <Text
              style={
                styles.unit
              }
            >
              {
                activeUnit
                  ?.name
              }
            </Text>
          </View>
        </View>


        {canOpenManagement && (
          <View
            style={
              styles.section
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Administração
            </Text>


            <Pressable
              onPress={() =>
                setShowingManagement(
                  true
                )
              }
              style={({
                pressed,
              }) => [
                styles.managementCard,

                pressed &&
                  styles.pressed,
              ]}
            >
              <View
                style={
                  styles.managementIcon
                }
              >
                <Ionicons
                  name="settings-outline"
                  size={22}
                  color="#333333"
                />
              </View>


              <View
                style={
                  styles.managementContent
                }
              >
                <Text
                  style={
                    styles.managementTitle
                  }
                >
                  Gestão da Igreja
                </Text>

                <Text
                  style={
                    styles.managementDescription
                  }
                >
                  Acessos, perfis, unidades e configurações.
                </Text>
              </View>


              <Ionicons
                name="chevron-forward"
                size={18}
                color="#999999"
              />
            </Pressable>
          </View>
        )}


        <View
          style={
            styles.section
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Conta
          </Text>


          <View
            style={
              styles.actions
            }
          >
            {organizations.length >
              1 && (
              <Pressable
                onPress={() => {
                  void clearOrganizationSelection();
                }}
                style={
                  styles.action
                }
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={19}
                  color="#555555"
                />

                <Text
                  style={
                    styles.actionText
                  }
                >
                  Trocar igreja
                </Text>

                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color="#aaaaaa"
                />
              </Pressable>
            )}


            <Pressable
              onPress={
                handleSignOut
              }
              style={
                styles.action
              }
            >
              <Ionicons
                name="log-out-outline"
                size={19}
                color="#555555"
              />

              <Text
                style={
                  styles.actionText
                }
              >
                Sair da conta
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,

      backgroundColor:
        "#f7f7f6",
    },

    content: {
      flexGrow: 1,

      paddingHorizontal:
        20,

      paddingTop:
        26,

      paddingBottom:
        40,
    },

    title: {
      fontSize:
        28,

      fontWeight:
        "700",

      color:
        "#111111",
    },

    account: {
      marginTop:
        25,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        12,

      paddingBottom:
        24,

      borderBottomWidth:
        1,

      borderBottomColor:
        "#e1e1de",
    },

    accountIcon: {
      width:
        44,

      height:
        44,

      alignItems:
        "center",

      justifyContent:
        "center",

      borderRadius:
        22,

      backgroundColor:
        "#eaeae7",
    },

    accountContent: {
      flex:
        1,
    },

    name: {
      fontSize:
        17,

      fontWeight:
        "700",

      color:
        "#1b1b1b",
    },

    organization: {
      marginTop:
        4,

      fontSize:
        13,

      color:
        "#555555",
    },

    unit: {
      marginTop:
        2,

      fontSize:
        12,

      color:
        "#777777",
    },

    section: {
      marginTop:
        25,
    },

    sectionTitle: {
      marginBottom:
        10,

      fontSize:
        12,

      fontWeight:
        "700",

      textTransform:
        "uppercase",

      letterSpacing:
        0.4,

      color:
        "#777777",
    },

    managementCard: {
      minHeight:
        77,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        12,

      paddingHorizontal:
        14,

      paddingVertical:
        12,

      borderWidth:
        1,

      borderColor:
        "#e0e0dd",

      borderRadius:
        14,

      backgroundColor:
        "#ffffff",
    },

    managementIcon: {
      width:
        42,

      height:
        42,

      alignItems:
        "center",

      justifyContent:
        "center",

      borderRadius:
        12,

      backgroundColor:
        "#f0f0ed",
    },

    managementContent: {
      flex:
        1,
    },

    managementTitle: {
      fontSize:
        15,

      fontWeight:
        "700",

      color:
        "#202020",
    },

    managementDescription: {
      marginTop:
        4,

      fontSize:
        12,

      lineHeight:
        17,

      color:
        "#737373",
    },

    actions: {
      borderTopWidth:
        1,

      borderTopColor:
        "#e1e1de",
    },

    action: {
      minHeight:
        54,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        11,

      borderBottomWidth:
        1,

      borderBottomColor:
        "#e1e1de",
    },

    actionText: {
      flex:
        1,

      fontSize:
        15,

      fontWeight:
        "600",

      color:
        "#222222",
    },

    pressed: {
      opacity:
        0.76,
    },
  });