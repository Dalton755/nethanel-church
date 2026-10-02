import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GerencialClient from "./gerencial-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Central Gerencial Nethanel",
  description: "Visão executiva, comercial e financeira dos produtos Nethanel.",
};

export default async function GerencialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/gerencial/login");
  }

  return (
    <>
      <GerencialClient userEmail={user.email ?? ""} />
      <Link
        href="/gerencial/infraestrutura"
        className="fixed bottom-5 right-5 z-50 rounded-2xl border border-sky-300/20 bg-sky-300 px-4 py-3 text-sm font-extrabold text-zinc-950 shadow-2xl shadow-black/40 transition hover:bg-sky-200"
      >
        Custos de infraestrutura
      </Link>
    </>
  );
}
