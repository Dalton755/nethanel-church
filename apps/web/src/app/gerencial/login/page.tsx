"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GerencialLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/gerencial");
    });
  }, [router, supabase]);

  async function entrarComGoogle() {
    setLoading(true);
    setError("");
    const redirectTo = window.location.origin + "/auth/callback?next=/gerencial";
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-10 text-white">
      <section className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-7 shadow-2xl backdrop-blur sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">
            Nethanel Tecnologia
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Central Gerencial</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Acesso restrito à administração da Nethanel.
          </p>
          <button
            type="button"
            onClick={entrarComGoogle}
            disabled={loading}
            className="mt-8 w-full rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-60"
          >
            {loading ? "Abrindo Google..." : "Continuar com Google"}
          </button>
          {error ? (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
