import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import * as Phosphor from "phosphor-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AgendaScreen } from "../features/agenda/AgendaScreen";
import { EloHubScreen, type EloModuleKey } from "../features/elo/EloHubScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { MoreScreen } from "../features/more/MoreScreen";
import { NotificationsScreen } from "../features/notifications/NotificationsScreen";
import { PeopleScreen } from "../features/people/PeopleScreen";

const P = Phosphor as any;

export type MainTabParamList = {
  Inicio: undefined;
  Agenda: undefined;
  Elo: { module?: EloModuleKey; nonce?: number } | undefined;
  Pessoas: undefined;
  Notificacoes: undefined;
  Mais: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const iconForRoute: Record<string, [string, string]> = {
  Inicio: ["HouseIcon", "HouseIcon"],
  Agenda: ["CalendarDotsIcon", "CalendarIcon"],
  Elo: ["CirclesThreePlusIcon", "CirclesThreeIcon"],
  Pessoas: ["UsersThreeIcon", "UsersIcon"],
  Notificacoes: ["BellIcon", "BellIcon"],
  Mais: ["UserCircleIcon", "UserIcon"],
};

export function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: "#2387C9",
          tabBarInactiveTintColor: "#7E8994",
          tabBarIcon: ({ focused, color }) => {
            const pair = iconForRoute[route.name] ?? ["SquaresFourIcon", "SquaresFourIcon"];
            const Icon = P[focused ? pair[0] : pair[1]] ?? P.SquaresFourIcon;

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
          component={HomeScreen}
          options={{ tabBarLabel: "Início" }}
        />

        <Tab.Screen name="Agenda" component={AgendaScreen} />

        <Tab.Screen
          name="Elo"
          component={EloHubScreen}
          options={{ tabBarLabel: "Meu Elo" }}
        />

        <Tab.Screen name="Pessoas" component={PeopleScreen} />

        <Tab.Screen
          name="Notificacoes"
          component={NotificationsScreen}
          options={{ tabBarLabel: "Avisos" }}
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
