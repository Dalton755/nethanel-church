import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  supabase,
} from "../../lib/supabase";


export function useUnreadNotifications(
  organizationId:
    string | undefined
) {
  const [
    unreadCount,
    setUnreadCount,
  ] =
    useState(0);


  const refresh =
    useCallback(
      async () => {
        if (!organizationId) {
          setUnreadCount(0);

          return;
        }


        const {
          count,
          error,
        } =
          await supabase
            .from(
              "notifications"
            )
            .select(
              "id",
              {
                count:
                  "exact",

                head:
                  true,
              }
            )
            .eq(
              "organization_id",
              organizationId
            )
            .is(
              "read_at",
              null
            )
            .is(
              "archived_at",
              null
            );


        if (error) {
          console.warn(
            "Falha ao contar notificações.",
            error
          );

          return;
        }


        setUnreadCount(
          count ?? 0
        );
      },
      [
        organizationId,
      ]
    );


  useEffect(() => {
    if (!organizationId) {
      setUnreadCount(0);

      return;
    }


    void refresh();


    const channel =
      supabase
        .channel(
          `notifications-badge-${organizationId}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "notifications",
            filter:
              `organization_id=eq.${organizationId}`,
          },
          () => {
            void refresh();
          }
        )
        .subscribe();


    return () => {
      void supabase
        .removeChannel(
          channel
        );
    };
  }, [
    organizationId,
    refresh,
  ]);


  return {
    unreadCount,
    refresh,
  };
}
