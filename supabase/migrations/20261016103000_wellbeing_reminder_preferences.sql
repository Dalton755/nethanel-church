-- Opt-in reminder preferences; delivery workers must check this table before sending.
create table if not exists public.member_wellbeing_preferences (
  person_id uuid primary key references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  daily_reminder_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.member_wellbeing_preferences enable row level security;
create policy "member reads own wellbeing preferences"
on public.member_wellbeing_preferences for select to authenticated
using (exists (
  select 1 from public.people p
  where p.id = person_id and p.organization_id = organization_id
    and p.auth_user_id = (select auth.uid())
));
create policy "member creates own wellbeing preferences"
on public.member_wellbeing_preferences for insert to authenticated
with check (exists (
  select 1 from public.people p
  where p.id = person_id and p.organization_id = organization_id
    and p.auth_user_id = (select auth.uid())
));
create policy "member updates own wellbeing preferences"
on public.member_wellbeing_preferences for update to authenticated
using (exists (
  select 1 from public.people p
  where p.id = person_id and p.organization_id = organization_id
    and p.auth_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.people p
  where p.id = person_id and p.organization_id = organization_id
    and p.auth_user_id = (select auth.uid())
));
grant select, insert, update on public.member_wellbeing_preferences to authenticated;
