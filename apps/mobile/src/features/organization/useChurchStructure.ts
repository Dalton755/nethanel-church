import { useCallback, useEffect, useState } from "react";
import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";

export type ChurchStructureSummary = {
  configured: boolean;
  estimated_members: number | null;
  ministry_scope: string;
  departments: Array<{ key: string; name: string; estimated_people: number }>;
  ministries: Array<{ key: string; name: string }>;
};

export function useChurchStructure(refreshKey?: string | null) {
  const { activeOrganization, activeUnit } = useOrganization();
  const [structure, setStructure] = useState<ChurchStructureSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeOrganization?.id || !activeUnit?.id) {
      setStructure(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_church_structure", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
      });
      if (error) throw error;
      setStructure(data as ChurchStructureSummary);
    } catch {
      // Compatibilidade para igrejas com o app antigo/DB ainda não migrado.
      setStructure(null);
    } finally {
      setLoading(false);
    }
  }, [activeOrganization?.id, activeUnit?.id]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);
  return { structure, structureLoading: loading, refreshStructure: refresh };
}
