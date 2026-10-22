import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Preview-only connection. Deliberately DOES NOT fall back to production env vars.
 * Set both NEXT_PUBLIC_ELO_STAGING_SUPABASE_URL and
 * NEXT_PUBLIC_ELO_STAGING_SUPABASE_ANON_KEY on the preview deployment only.
 */
export function createEloStagingClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_ELO_STAGING_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_ELO_STAGING_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!url.startsWith("https://zhvbjzpszzpywnwcmulm.supabase.co")) return null;
  return createClient(url, key, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: "elo-staging-auth" } });
}
export type EloInvitation = {
  id: string; organization_id: string; organization_name: string;
  kind: string; status: string; expires_at: string; created_at: string;
};
export async function listMyInvitations(client: SupabaseClient): Promise<EloInvitation[]> {
  const { data, error } = await client.rpc("elo_my_invitations");
  if (error) throw error;
  return (data ?? []) as EloInvitation[];
}
export async function declineInvitation(client: SupabaseClient, invitationId: string) {
  const { error } = await client.rpc("elo_decline_invitation", { p_invitation_id: invitationId });
  if (error) throw error;
}
export async function issueInvitation(client: SupabaseClient, personId: string, kind: string, departmentId?: string) {
  const { data, error } = await client.rpc("elo_issue_invitation", {
    p_person_id: personId, p_kind: kind, p_department_id: departmentId ?? null
  });
  if (error) throw error;
  return data as string;
}
export type CongregantRegistration = {
  invitationId:string; name:string; birth:string; whatsapp:string; marital:string;
  cep:string; street:string; number:string; complement:string; neighborhood:string;
  city:string; state:string; baptized:string; baptismDate:string; churchRole:string; department:string;
};
export async function acceptCongregantInvitation(client: SupabaseClient, form:CongregantRegistration) {
  const { error } = await client.rpc("elo_accept_congregant_invite", {
    p_invitation_id:form.invitationId, p_full_name:form.name, p_birth_date:form.birth,
    p_whatsapp:form.whatsapp, p_marital_status:form.marital || null, p_cep:form.cep,
    p_street:form.street, p_street_number:form.number, p_complement:form.complement || null,
    p_neighborhood:form.neighborhood || null, p_city:form.city, p_state:form.state,
    p_baptism_status:form.baptized, p_baptism_date:form.baptismDate || null,
    p_ecclesiastical_title:form.churchRole || null, p_department_name:form.department || null
  });
  if (error) throw error;
}
