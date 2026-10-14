import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InfrastructureClient from "./infrastructure-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Infraestrutura | Central Nethanel",
  description: "Custos, planos e vencimentos da infraestrutura Nethanel.",
};

export default async function InfrastructurePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/gerencial/login");
  }

  return <InfrastructureClient />;
}
