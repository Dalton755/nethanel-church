-- ELO v51b — índices das chaves estrangeiras da estrutura da igreja.
create index if not exists church_structure_unit_fk_idx
  on public.church_structure_settings(unit_id,organization_id);
create index if not exists church_structure_updated_by_fk_idx
  on public.church_structure_settings(updated_by);
