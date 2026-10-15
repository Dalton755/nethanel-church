-- Monitor de bem-estar: migration preparada, NÃO aplicada à produção.
create table if not exists public.member_wellbeing_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  person_id uuid not null references public.people(id),
  checkin_date date not null,
  emotional smallint check (emotional between 1 and 5),
  financial smallint check (financial between 1 and 5),
  sentimental smallint check (sentimental between 1 and 5),
  spiritual smallint check (spiritual between 1 and 5),
  wants_contact boolean not null default false,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellbeing_has_response check (
    emotional is not null or financial is not null or sentimental is not null
    or spiritual is not null or wants_contact
  ),
  unique (person_id, checkin_date)
);
create index if not exists wellbeing_org_date_idx
  on public.member_wellbeing_checkins (organization_id, checkin_date desc);
create index if not exists wellbeing_person_date_idx
  on public.member_wellbeing_checkins (person_id, checkin_date desc);
alter table public.member_wellbeing_checkins enable row level security;
-- Acesso inicial estritamente individual. Acesso pastoral será liberado
-- somente após validar papéis e consentimento explícito.
create policy "member reads own wellbeing"
on public.member_wellbeing_checkins for select to authenticated
using (exists (
  select 1 from public.people p
  where p.id = person_id and p.organization_id = organization_id
    and p.auth_user_id = (select auth.uid())
));
create policy "member inserts own wellbeing"
on public.member_wellbeing_checkins for insert to authenticated
with check (exists (
  select 1 from public.people p
  where p.id = person_id and p.organization_id = organization_id
    and p.auth_user_id = (select auth.uid())
));
create policy "member updates own wellbeing"
on public.member_wellbeing_checkins for update to authenticated
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
create policy "member deletes own wellbeing"
on public.member_wellbeing_checkins for delete to authenticated
using (exists (
  select 1 from public.people p
  where p.id = person_id and p.organization_id = organization_id
    and p.auth_user_id = (select auth.uid())
));
grant select, insert, update, delete on public.member_wellbeing_checkins to authenticated;
