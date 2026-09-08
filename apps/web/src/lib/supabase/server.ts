import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL não está configurada."
    );
  }

  if (!supabasePublishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY não está configurada."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            /*
             * Server Components não podem sempre
             * alterar cookies diretamente.
             *
             * O proxy será responsável por renovar
             * a sessão quando necessário.
             */
          }
        },
      },
    }
  );
}