-- Elo: cadastro de aplicativos Android Firebase por igreja.
-- Guarda somente identificadores PUBLICOS do Firebase, nunca credenciais FCM ou chaves privadas.
create table if not exists public.church_firebase_android_apps (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  firebase_project_id text not null
     check (firebase_project_id ~ '^[a-z][a-z0-9-]{2,49}$'),
  firebase_app_id text not null unique
     check (firebase_app_id ~ '^1:[0-9]+:android:[a-zA-Z0-9]+$'),
  android_package text not null unique
     check (android_package ~ '^br[.]com[.]nethanel[.]elo[.]c[a-f0-9]{32}$'),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.church_firebase_android_apps enable row level security;
revoke all on table public.church_firebase_android_apps from anon,authenticated;
grant select on table public.church_firebase_android_apps to service_role;
comment on table public.church_firebase_android_apps is
  'Public Firebase Android IDs per branded APK. Only backend service role can read; no FCM private keys.';
