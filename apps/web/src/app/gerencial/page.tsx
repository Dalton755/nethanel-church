import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GerencialClient from "./gerencial-client";

export const dynamic = "force-dynamic";

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

  return <GerencialClient userEmail={user.email ?? ""} />;
}
