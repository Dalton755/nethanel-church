-- ELO v40b — índices das FKs do convite de pregador

create index if not exists preacher_invitations_unit_fk_idx
  on public.preacher_invitations(unit_id);

create index if not exists preacher_invitations_event_fk_idx
  on public.preacher_invitations(event_id);

create index if not exists preacher_invitations_invited_by_fk_idx
  on public.preacher_invitations(invited_by);

create index if not exists preacher_invitations_person_org_fk_idx
  on public.preacher_invitations(preacher_person_id, organization_id);
