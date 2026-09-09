import {
    NavigationContainer,
} from "@react-navigation/native";

import {
    createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";

import { AgendaScreen } from "../features/agenda/AgendaScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { MoreScreen } from "../features/more/MoreScreen";
import { PeopleScreen } from "../features/people/PeopleScreen";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type MainTabParamList = {
    Inicio: undefined;
    Agenda: undefined;
    Pessoas: undefined;
    Mais: undefined;
};

const Tab =
    createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
    const insets = useSafeAreaInsets();

    return (
        <NavigationContainer>
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    headerShown: false,

                    tabBarHideOnKeyboard: true,

                    tabBarActiveTintColor: "#111111",
                    tabBarInactiveTintColor: "#8a8a8a",

                    tabBarIcon: ({
                        focused,
                    }) => {
                        let iconName:
                            | "home"
                            | "home-outline"
                            | "calendar"
                            | "calendar-outline"
                            | "people"
                            | "people-outline"
                            | "menu"
                            | "menu-outline";

                        switch (route.name) {
                            case "Inicio":
                                iconName = focused
                                    ? "home"
                                    : "home-outline";
                                break;

                            case "Agenda":
                                iconName = focused
                                    ? "calendar"
                                    : "calendar-outline";
                                break;

                            case "Pessoas":
                                iconName = focused
                                    ? "people"
                                    : "people-outline";
                                break;

                            default:
                                iconName = focused
                                    ? "menu"
                                    : "menu-outline";
                        }

                        return (
                            <Ionicons
                                name={iconName}
                                size={22}
                                color={
                                    focused
                                        ? "#111111"
                                        : "#707070"
                                }
                            />
                        );
                    },

                    tabBarStyle: {
                        height: 58 + insets.bottom,
                        paddingTop: 6,
                        paddingBottom:
                            Math.max(insets.bottom, 6),
                        borderTopWidth: 1,
                        borderTopColor: "#e2e2df",
                        backgroundColor: "#ffffff",
                    },

                    tabBarIconStyle: {
                        marginTop: 1,
                    },

                    tabBarLabelStyle: {
                        fontSize: 11,
                        fontWeight: "600",
                        marginTop: 2,
                    },
                    tabBarItemStyle: {
                        paddingTop: 2,
                    },
                })}
            >
                <Tab.Screen
                    name="Inicio"
                    component={HomeScreen}
                    options={{
                        tabBarLabel: "Início",
                    }}
                />

                <Tab.Screen
                    name="Agenda"
                    component={AgendaScreen}
                />

                <Tab.Screen
                    name="Pessoas"
                    component={PeopleScreen}
                />

                <Tab.Screen
                    name="Mais"
                    component={MoreScreen}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
}