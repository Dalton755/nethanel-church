import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import {
  useEffect,
} from "react";
import {
  AppState,
  Platform,
} from "react-native";

import {
  useOrganization,
} from "../../contexts/OrganizationContext";

import {
  supabase,
} from "../../lib/supabase";


const DEVICE_KEY_STORAGE =
  "@nethanel/push-device-key";


Notifications.setNotificationHandler({
  handleNotification:
    async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});


export type PushRegistrationStatus =
  | "registered"
  | "permission_denied"
  | "missing_project_id"
  | "unsupported_platform"
  | "error";


function getExpoProjectId() {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas
      ?.projectId ??
    null
  );
}


async function getDeviceKey() {
  const current =
    await AsyncStorage.getItem(
      DEVICE_KEY_STORAGE
    );


  if (current) {
    return current;
  }


  const next =
    [
      Platform.OS,
      Date.now().toString(36),
      Math.random()
        .toString(36)
        .slice(2),
    ].join("-");


  await AsyncStorage.setItem(
    DEVICE_KEY_STORAGE,
    next
  );


  return next;
}


async function ensureAndroidChannel() {
  if (
    Platform.OS !== "android"
  ) {
    return;
  }


  await Notifications
    .setNotificationChannelAsync(
      "elo-geral",
      {
        name: "Elo",
        importance:
          Notifications
            .AndroidImportance
            .HIGH,
        sound: "default",
        vibrationPattern: [
          0,
          250,
          250,
          250,
        ],
      }
    );
}


export async function registerPushDevice(
  organizationId: string
): Promise<PushRegistrationStatus> {
  if (
    Platform.OS !== "android" &&
    Platform.OS !== "ios"
  ) {
    return "unsupported_platform";
  }


  try {
    await ensureAndroidChannel();


    const permission =
      await Notifications
        .getPermissionsAsync();


    if (
      permission.status !==
      "granted"
    ) {
      return "permission_denied";
    }


    const projectId =
      getExpoProjectId();


    if (!projectId) {
      return "missing_project_id";
    }


    const token =
      await Notifications
        .getExpoPushTokenAsync({
          projectId,
        });


    const deviceKey =
      await getDeviceKey();


    const {
      error,
    } =
      await supabase.rpc(
        "register_push_device",
        {
          p_organization_id:
            organizationId,

          p_push_token:
            token.data,

          p_platform:
            Platform.OS,

          p_device_key:
            deviceKey,

          p_app_version:
            Constants.expoConfig
              ?.version ??
            null,
        }
      );


    if (error) {
      throw error;
    }


    return "registered";
  } catch (error) {
    console.warn(
      "Não foi possível registrar push.",
      error
    );

    return "error";
  }
}


export async function requestAndRegisterPush(
  organizationId: string
): Promise<PushRegistrationStatus> {
  if (
    Platform.OS !== "android" &&
    Platform.OS !== "ios"
  ) {
    return "unsupported_platform";
  }


  try {
    await ensureAndroidChannel();


    const permission =
      await Notifications
        .requestPermissionsAsync();


    if (
      permission.status !==
      "granted"
    ) {
      return "permission_denied";
    }


    return await registerPushDevice(
      organizationId
    );
  } catch (error) {
    console.warn(
      "Não foi possível solicitar push.",
      error
    );

    return "error";
  }
}


export function PushNotificationRegistration() {
  const {
    activeOrganization,
  } =
    useOrganization();


  useEffect(() => {
    const organizationId =
      activeOrganization?.id;


    if (!organizationId) {
      return;
    }


    let mounted =
      true;


    async function syncIfAuthorized() {
      const permission =
        await Notifications
          .getPermissionsAsync();


      if (
        !mounted ||
        permission.status !==
          "granted"
      ) {
        return;
      }


      await registerPushDevice(
        organizationId
      );
    }


    void syncIfAuthorized();


    const subscription =
      AppState.addEventListener(
        "change",
        (state) => {
          if (
            state === "active"
          ) {
            void syncIfAuthorized();
          }
        }
      );


    return () => {
      mounted =
        false;

      subscription.remove();
    };
  }, [
    activeOrganization?.id,
  ]);


  return null;
}
