-- Server-only idempotency log. Never grant API access to authenticated or anon.
create table if not exists public.member_wellbeing_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  person_id uuid not null references public.people(id),
  reminder_date date not null,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  attempted_at timestamptz not null default now(),
  unique (person_id, reminder_date)
);
alter table public.member_wellbeing_reminder_deliveries enable row level security;
revoke all on public.member_wellbeing_reminder_deliveries from anon, authenticated;
create index if not exists wellbeing_reminder_date_idx
  on public.member_wellbeing_reminder_deliveries(reminder_date, status);
