import {
  useCallback,
  useEffect,
  useState,
} from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  View,
} from "react-native";

import {
  SafeAreaProvider,
} from "react-native-safe-area-context";

import type {
  Session,
} from "@supabase/supabase-js";

import * as Linking from "expo-linking";

import {
  AuthScreen,
} from "./src/features/auth/AuthScreen";

import {
  AuthenticatedScreen,
} from "./src/features/auth/AuthenticatedScreen";

import {
  InvitePasswordScreen,
} from "./src/features/auth/InvitePasswordScreen";

import {
  OrganizationProvider,
} from "./src/contexts/OrganizationContext";

import {
  supabase,
} from "./src/lib/supabase";

const INVITE_PENDING_PREFIX =
  "@nethanel/invite-pending/";


function getUrlParameters(
  url: string
) {
  const result =
    new URLSearchParams();


  /*
   * Parâmetros depois de ?
   */
  const queryIndex =
    url.indexOf("?");

  const hashIndex =
    url.indexOf("#");


  if (
    queryIndex >= 0
  ) {
    const queryEnd =
      hashIndex >= 0
        ? hashIndex
        : url.length;


    const query =
      url.slice(
        queryIndex + 1,
        queryEnd
      );


    const queryParams =
      new URLSearchParams(
        query
      );


    queryParams.forEach(
      (value, key) => {
        result.set(
          key,
          value
        );
      }
    );
  }


  /*
   * Tokens do Supabase normalmente
   * chegam depois de # no fluxo mobile.
   */
  if (
    hashIndex >= 0
  ) {
    const hash =
      url.slice(
        hashIndex + 1
      );


    const hashParams =
      new URLSearchParams(
        hash
      );


    hashParams.forEach(
      (value, key) => {
        result.set(
          key,
          value
        );
      }
    );
  }


  return result;
}


export default function App() {
  const [
    session,
    setSession,
  ] =
    useState<
      Session | null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  /*
   * Quando true, existe uma sessão,
   * mas o usuário ainda precisa definir
   * a senha do convite.
   */
  const [
    invitePending,
    setInvitePending,
  ] =
    useState(false);


  const handleAuthUrl =
    useCallback(
      async (
        url:
          string | null
      ) => {
        if (!url) {
          return;
        }


        const isInvite =
          url.startsWith(
            "nethanelchurch://auth/invite"
          );

        const isConfirmation =
          url.startsWith(
            "nethanelchurch://auth/confirm"
          );

        if (
          !isInvite &&
          !isConfirmation
        ) {
          return;
        }


        setLoading(
          true
        );


        try {
          const params =
            getUrlParameters(
              url
            );


          const errorDescription =
            params.get(
              "error_description"
            );


          if (
            errorDescription
          ) {
            throw new Error(
              decodeURIComponent(
                errorDescription
              )
            );
          }


          const accessToken =
            params.get(
              "access_token"
            );


          const refreshToken =
            params.get(
              "refresh_token"
            );


          const code =
            params.get(
              "code"
            );


          /*
           * Fluxo mobile tradicional:
           * access_token + refresh_token.
           */
          if (
            accessToken &&
            refreshToken
          ) {
            const {
              data,
              error,
            } =
              await supabase.auth.setSession({
                access_token:
                  accessToken,

                refresh_token:
                  refreshToken,
              });


            if (error) {
              throw error;
            }


            if (!data.session) {
              throw new Error(
                "Não foi possível criar a sessão do convite."
              );
            }


            if (isInvite) {
              await AsyncStorage.setItem(
                `${INVITE_PENDING_PREFIX}${data.session.user.id}`,
                "true"
              );

              setInvitePending(
                true
              );
            } else {
              setInvitePending(
                false
              );
            }


            setSession(
              data.session
            );

            return;
          }


          /*
           * Suporte também ao fluxo PKCE,
           * caso o Supabase retorne code.
           */
          if (code) {
            const {
              data,
              error,
            } =
              await supabase.auth
                .exchangeCodeForSession(
                  code
                );


            if (error) {
              throw error;
            }


            if (!data.session) {
              throw new Error(
                "Não foi possível criar a sessão."
              );
            }


            if (isInvite) {
              await AsyncStorage.setItem(
                `${INVITE_PENDING_PREFIX}${data.session.user.id}`,
                "true"
              );


              setInvitePending(
                true
              );
            } else {
              setInvitePending(
                false
              );
            }


            setSession(
              data.session
            );

            return;
          }


          throw new Error(
            "O convite não contém uma sessão válida. Ele pode ter expirado."
          );
        } catch (error) {
          setInvitePending(
            false
          );


          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível abrir o convite.";


          Alert.alert(
            "Convite inválido",
            message
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );


  useEffect(() => {
    let mounted =
      true;


    async function initialize() {
      /*
       * Primeiro verificamos se o aplicativo
       * foi aberto através de um convite.
       */
      const initialUrl =
        await Linking.getInitialURL();


      if (
        initialUrl?.startsWith(
          "nethanelchurch://auth/invite"
        ) ||
        initialUrl?.startsWith(
          "nethanelchurch://auth/confirm"
        )
      ) {
        await handleAuthUrl(
          initialUrl
        );

        if (mounted) {
          setLoading(
            false
          );
        }

        return;
      }


      const {
        data: {
          session:
          currentSession,
        },
      } =
        await supabase.auth
          .getSession();


      if (!mounted) {
        return;
      }


      setSession(
        currentSession
      );


      if (currentSession) {
        const pendingInvite =
          await AsyncStorage.getItem(
            `${INVITE_PENDING_PREFIX}${currentSession.user.id}`
          );


        setInvitePending(
          pendingInvite === "true"
        );
      }


      setLoading(
        false
      );
    }


    void initialize();


    const linkingSubscription =
      Linking.addEventListener(
        "url",
        ({
          url,
        }) => {
          void handleAuthUrl(
            url
          );
        }
      );


    const {
      data: {
        subscription:
        authSubscription,
      },
    } =
      supabase.auth
        .onAuthStateChange(
          (
            _event,
            nextSession
          ) => {
            setSession(
              nextSession
            );

            setLoading(
              false
            );
          }
        );


    return () => {
      mounted =
        false;

      linkingSubscription.remove();

      authSubscription.unsubscribe();
    };
  }, [
    handleAuthUrl,
  ]);


  return (
    <SafeAreaProvider>
      {loading ? (
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            size="large"
          />
        </View>
      ) : invitePending &&
        session ? (
        <InvitePasswordScreen
          onCompleted={() => {
            void (async () => {
              if (session) {
                await AsyncStorage.removeItem(
                  `${INVITE_PENDING_PREFIX}${session.user.id}`
                );
              }


              setInvitePending(
                false
              );
            })();
          }}
        />
      ) : session ? (
        <OrganizationProvider
          userId={
            session.user.id
          }
        >
          <AuthenticatedScreen />
        </OrganizationProvider>
      ) : (
        <AuthScreen />
      )}
    </SafeAreaProvider>
  );
}


const styles =
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f7f7f6",
    },
  });