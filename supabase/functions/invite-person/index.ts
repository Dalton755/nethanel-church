import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type InviteRequest = {
  organizationId?: string;
  personId?: string;
};

type InviteTarget = {
  person_id: string;
  full_name: string;
  email: string;

  current_auth_user_id:
    | string
    | null;

  existing_auth_user_id:
    | string
    | null;
};

const REDIRECT_URL =
  "nethanelchurch://auth/invite";


function errorResponse(
  message: string,
  status = 400
) {
  return Response.json(
    {
      ok: false,
      message,
    },
    {
      status,
    }
  );
}


export default {
  fetch: withSupabase(
    {
      auth: "user",
    },

    async (
      req,
      ctx
    ) => {
      if (
        req.method !== "POST"
      ) {
        return errorResponse(
          "Method not allowed",
          405
        );
      }


      let body:
        InviteRequest;

      try {
        body =
          await req.json();
      } catch {
        return errorResponse(
          "Invalid request body"
        );
      }


      const organizationId =
        body.organizationId;

      const personId =
        body.personId;


      if (
        !organizationId ||
        !personId
      ) {
        return errorResponse(
          "organizationId and personId are required"
        );
      }


      /*
       * Esta RPC valida security.manage.
       *
       * Portanto a Edge Function não confia
       * apenas no fato de existir um usuário
       * autenticado.
       */
      const {
        data:
          targetData,

        error:
          targetError,
      } =
        await ctx.supabase.rpc(
          "get_person_invite_target",
          {
            p_organization_id:
              organizationId,

            p_person_id:
              personId,
          }
        );


      if (targetError) {
        return errorResponse(
          targetError.message,
          403
        );
      }


      const target =
        targetData as
          InviteTarget;


      /*
       * Já está vinculado.
       */
      if (
        target.current_auth_user_id
      ) {
        return Response.json({
          ok: true,

          status:
            "already_linked",

          message:
            "Esta pessoa já possui login vinculado.",

          authUserId:
            target.current_auth_user_id,
        });
      }


      /*
       * A conta já existe no Auth.
       *
       * Isso pode acontecer quando a pessoa
       * já participa de outra organização.
       *
       * Não enviamos outro convite:
       * apenas vinculamos a conta existente.
       */
      if (
        target.existing_auth_user_id
      ) {
        const {
          error:
            linkError,
        } =
          await ctx.supabase.rpc(
            "link_person_auth_user",
            {
              p_organization_id:
                organizationId,

              p_person_id:
                personId,

              p_auth_user_id:
                target.existing_auth_user_id,
            }
          );


        if (linkError) {
          return errorResponse(
            linkError.message,
            400
          );
        }


        return Response.json({
          ok: true,

          status:
            "linked_existing",

          message:
            "A pessoa já possuía uma conta e foi vinculada a esta igreja.",

          authUserId:
            target.existing_auth_user_id,
        });
      }


      /*
       * Criar usuário Auth e enviar convite.
       *
       * ctx.supabaseAdmin utiliza a credencial
       * secreta somente dentro do servidor.
       */
      const {
        data:
          inviteData,

        error:
          inviteError,
      } =
        await ctx.supabaseAdmin
          .auth
          .admin
          .inviteUserByEmail(
            target.email,
            {
              redirectTo:
                REDIRECT_URL,

              data: {
                full_name:
                  target.full_name,

                person_id:
                  personId,

                organization_id:
                  organizationId,
              },
            }
          );


      if (
        inviteError
      ) {
        /*
         * Pode ter ocorrido uma corrida:
         * a conta pode ter sido criada entre
         * nossa consulta e o convite.
         *
         * Consultamos novamente.
         */
        const {
          data:
            refreshedData,
        } =
          await ctx.supabase.rpc(
            "get_person_invite_target",
            {
              p_organization_id:
                organizationId,

              p_person_id:
                personId,
            }
          );


        const refreshed =
          refreshedData as
            | InviteTarget
            | null;


        if (
          refreshed
            ?.existing_auth_user_id
        ) {
          const {
            error:
              retryLinkError,
          } =
            await ctx.supabase.rpc(
              "link_person_auth_user",
              {
                p_organization_id:
                  organizationId,

                p_person_id:
                  personId,

                p_auth_user_id:
                  refreshed
                    .existing_auth_user_id,
              }
            );


          if (
            !retryLinkError
          ) {
            return Response.json({
              ok: true,

              status:
                "linked_existing",

              message:
                "A conta existente foi vinculada à igreja.",

              authUserId:
                refreshed
                  .existing_auth_user_id,
            });
          }
        }


        return errorResponse(
          inviteError.message,
          400
        );
      }


      const authUserId =
        inviteData.user?.id;


      if (
        !authUserId
      ) {
        return errorResponse(
          "O convite foi criado, mas o usuário Auth não foi retornado.",
          500
        );
      }


      /*
       * Vincular o usuário recém-criado
       * à pessoa da organização.
       */
      const {
        error:
          linkError,
      } =
        await ctx.supabase.rpc(
          "link_person_auth_user",
          {
            p_organization_id:
              organizationId,

            p_person_id:
              personId,

            p_auth_user_id:
              authUserId,
          }
        );


      if (
        linkError
      ) {
        return errorResponse(
          `O convite foi enviado, mas não foi possível vincular o acesso: ${linkError.message}`,
          500
        );
      }


      return Response.json({
        ok: true,

        status:
          "invited",

        message:
          "Convite enviado com sucesso.",

        email:
          target.email,

        authUserId,
      });
    }
  ),
};