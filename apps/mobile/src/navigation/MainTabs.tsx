import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import * as Phosphor from "phosphor-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrganization } from "../contexts/OrganizationContext";
import { AgendaScreen } from "../features/agenda/AgendaScreen";
import { EloHubScreen, type EloModuleKey } from "../features/elo/EloHubScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import {
  MemberAgendaScreen,
} from "../features/member/MemberAgendaScreen";
import {
  MemberHomeScreen,
} from "../features/member/MemberHomeScreen";
import {
  MemberHubScreen,
  type MemberModuleKey,
} from "../features/member/MemberHubScreen";
import { MoreScreen } from "../features/more/MoreScreen";
import { NotificationsScreen } from "../features/notifications/NotificationsScreen";
import { PeopleScreen } from "../features/people/PeopleScreen";

const P = Phosphor as any;

export type MainTabParamList = {
  Inicio: undefined;
  Agenda: undefined;
  Elo:
    | {
        module?: EloModuleKey | MemberModuleKey;
        nonce?: number;
      }
    | undefined;
  Pessoas: undefined;
  Notificacoes: undefined;
  Mais: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const navigationRef =
  createNavigationContainerRef<MainTabParamList>();

const iconForRoute: Record<string, [string, string]> = {
  Inicio: ["HouseIcon", "HouseIcon"],
  Agenda: ["CalendarDotsIcon", "CalendarIcon"],
  Elo: ["CirclesThreePlusIcon", "CirclesThreeIcon"],
  Pessoas: ["UsersThreeIcon", "UsersIcon"],
  Notificacoes: ["BellIcon", "BellIcon"],
  Mais: ["UserCircleIcon", "UserIcon"],
};

const MANAGEMENT_ROLES = new Set([
  "owner",
  "admin",
  "pastor",
  "secretario",
  "tesoureiro",
  "lider",
]);

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const { activeOrganization } = useOrganization();

  const brandColor =
    activeOrganization?.primary_color ?? "#2387C9";

  const roleKeys =
    activeOrganization?.roles.map((role) =>
      role.role_key.toLowerCase()
    ) ?? [];

  /*
   * Membro e voluntário recebem uma experiência centrada na própria
   * vida na igreja. Perfis de gestão continuam usando os módulos
   * administrativos já existentes.
   */
  const memberExperience =
    !roleKeys.some((roleKey) =>
      MANAGEMENT_ROLES.has(roleKey)
    );

  const StartScreen =
    memberExperience ? MemberHomeScreen : HomeScreen;

  const UserAgendaScreen =
    memberExperience ? MemberAgendaScreen : AgendaScreen;

  const UserEloScreen =
    memberExperience ? MemberHubScreen : EloHubScreen;

  useEffect(() => {
    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data =
            response.notification.request.content.data as
              | Record<string, unknown>
              | undefined;

          if (!navigationRef.isReady()) {
            return;
          }

          const targetModule =
            typeof data?.target_module === "string"
              ? data.target_module
              : null;

          if (targetModule === "schedules") {
            navigationRef.navigate("Elo", {
              module: "schedules",
              nonce: Date.now(),
            });
            return;
          }

          if (targetModule === "events") {
            navigationRef.navigate("Elo", {
              module: "events",
              nonce: Date.now(),
            });
            return;
          }

          if (
            targetModule === "pastoral" ||
            data?.type === "pastoral_request"
          ) {
            navigationRef.navigate("Elo", {
              module: memberExperience ? "pastoral" : "care",
              nonce: Date.now(),
            });
          }
        }
      );

    return () => {
      subscription.remove();
    };
  }, [memberExperience]);

  return (
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: brandColor,
          tabBarInactiveTintColor: "#7E8994",
          tabBarIcon: ({ focused, color }) => {
            const pair =
              iconForRoute[route.name] ??
              ["SquaresFourIcon", "SquaresFourIcon"];

            const Icon =
              P[focused ? pair[0] : pair[1]] ??
              P.SquaresFourIcon;

            return (
              <Icon
                size={22}
                color={color}
                weight={focused ? "fill" : "regular"}
              />
            );
          },
          tabBarStyle: {
            height: 60 + insets.bottom,
            paddingTop: 7,
            paddingBottom: Math.max(insets.bottom, 7),
            borderTopWidth: 1,
            borderTopColor: "#DEE5EB",
            backgroundColor: "#FFFFFF",
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "800",
            marginTop: 2,
          },
        })}
      >
        <Tab.Screen
          name="Inicio"
          component={StartScreen}
          options={{ tabBarLabel: "Início" }}
        />

        <Tab.Screen
          name="Agenda"
          component={UserAgendaScreen}
          options={{
            tabBarLabel: memberExperience ? "Minha agenda" : "Agenda",
          }}
        />

        <Tab.Screen
          name="Elo"
          component={UserEloScreen}
          options={{ tabBarLabel: "Meu Elo" }}
        />

        {!memberExperience ? (
          <Tab.Screen
            name="Pessoas"
            component={PeopleScreen}
          />
        ) : null}

        <Tab.Screen
          name="Notificacoes"
          component={NotificationsScreen}
          options={{
            tabBarLabel: "Avisos",
            tabBarItemStyle:
              memberExperience
                ? { display: "none" }
                : undefined,
          }}
        />

        <Tab.Screen
          name="Mais"
          component={MoreScreen}
          options={{ tabBarLabel: "Perfil" }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
