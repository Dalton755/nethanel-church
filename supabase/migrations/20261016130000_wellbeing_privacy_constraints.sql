-- A request for pastoral contact must be explicitly shared with the pastoral team.
-- Protect this invariant even if a client bypasses the form.
alter table public.member_wellbeing_checkins
  add constraint wellbeing_contact_requires_consent
  check (not wants_contact or share_with_pastoral);

-- Prevent duplicate or cross-church person references at the database layer.
-- People can have different organization records, so the check is tied to the same person row.
create or replace function public.wellbeing_person_org_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.people p
    where p.id = new.person_id and p.organization_id = new.organization_id
  ) then
    raise check_violation using message = 'Wellbeing person and organization mismatch';
  end if;
  return new;
end;
$$;
revoke all on function public.wellbeing_person_org_guard() from public, anon, authenticated;
create trigger wellbeing_checkin_org_guard
before insert or update on public.member_wellbeing_checkins
for each row execute function public.wellbeing_person_org_guard();
create trigger wellbeing_preferences_org_guard
before insert or update on public.member_wellbeing_preferences
for each row execute function public.wellbeing_person_org_guard();
-- Follow-up uses created_by instead of person_id.
create or replace function public.wellbeing_followup_org_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.people p
    where p.id = new.created_by and p.organization_id = new.organization_id
  ) or not exists (
    select 1 from public.member_wellbeing_checkins c
    where c.id = new.checkin_id and c.organization_id = new.organization_id
  ) then
    raise check_violation using message = 'Wellbeing follow-up organization mismatch';
  end if;
  return new;
end;
$$;
revoke all on function public.wellbeing_followup_org_guard() from public, anon, authenticated;
create trigger wellbeing_followup_org_guard
before insert or update on public.member_wellbeing_followups
for each row execute function public.wellbeing_followup_org_guard();
