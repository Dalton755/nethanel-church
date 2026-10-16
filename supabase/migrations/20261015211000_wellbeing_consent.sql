-- Member consent: no pastoral visibility by default.
alter table public.member_wellbeing_checkins
  add column if not exists share_with_pastoral boolean not null default false;

comment on column public.member_wellbeing_checkins.share_with_pastoral is
  'Explicit opt-in by the member. Defaults to private.';
