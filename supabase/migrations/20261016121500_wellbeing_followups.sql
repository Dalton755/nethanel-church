-- Follow-up records stay tied to consented check-ins.
create table if not exists public.member_wellbeing_followups (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.member_wellbeing_checkins(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references public.people(id),
  action text not null check (action in ('contact_requested', 'contacted', 'counseling', 'visit_planned', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists wellbeing_followups_checkin_idx on public.member_wellbeing_followups(checkin_id, created_at desc);
alter table public.member_wellbeing_followups enable row level security;
-- Access to follow-up records only while the underlying check-in is shared.
create policy "pastors read consented followups"
on public.member_wellbeing_followups for select to authenticated
using (
  exists (
    select 1 from public.member_wellbeing_checkins c
    where c.id = checkin_id and c.organization_id = organization_id
      and c.share_with_pastoral
  )
  and exists (
    select 1 from public.people p
    join public.user_role_assignments a on a.person_id = p.id and a.organization_id = p.organization_id
    join public.roles r on r.id = a.role_id and r.organization_id = a.organization_id
    where p.auth_user_id = (select auth.uid()) and p.organization_id = member_wellbeing_followups.organization_id
      and a.is_active and r.is_active and r.role_key in ('pastor','pastoral')
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at >= now())
  )
);
create policy "pastors create consented followups"
on public.member_wellbeing_followups for insert to authenticated
with check (
  exists (
    select 1 from public.member_wellbeing_checkins c
    where c.id = checkin_id and c.organization_id = organization_id
      and c.share_with_pastoral
  )
  and exists (
    select 1 from public.people p
    join public.user_role_assignments a on a.person_id = p.id and a.organization_id = p.organization_id
    join public.roles r on r.id = a.role_id and r.organization_id = a.organization_id
    where p.id = created_by and p.auth_user_id = (select auth.uid())
      and p.organization_id = member_wellbeing_followups.organization_id
      and a.is_active and r.is_active and r.role_key in ('pastor','pastoral')
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at >= now())
  )
);
grant select, insert on public.member_wellbeing_followups to authenticated;
