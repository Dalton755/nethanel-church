-- Elo: convite e cadastro (migração para homologação; NÃO executar em produção sem testes)
create table if not exists public.elo_invitations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 person_id uuid not null references public.people(id),
 invited_by uuid not null references auth.users(id),
 kind text not null check (kind in ('congregado','pastor','tesoureiro','midia','secretaria','lider_departamento','administrador')),
 department_id uuid,
 status text not null default 'pending' check (status in ('pending','accepted','declined','revoked','expired')),
 expires_at timestamptz not null default (now() + interval '14 days'),
 accepted_at timestamptz,
 created_at timestamptz not null default now(),
 constraint elo_invitation_unique_pending unique (organization_id, person_id, kind, status)
);
create table if not exists public.elo_congregant_profiles (
 person_id uuid primary key references public.people(id) on delete cascade,
 organization_id uuid not null references public.organizations(id),
 whatsapp text not null,
 marital_status text,
 cep text not null,
 street text not null,
 street_number text not null,
 complement text,
 neighborhood text,
 city text not null,
 state text not null,
 baptism_status text not null check (baptism_status in ('sim','nao','nao_sei')),
 baptism_date date,
 ecclesiastical_title text,
 department_name text,
 updated_at timestamptz not null default now()
);
create table if not exists public.elo_invitation_audit (
 id bigint generated always as identity primary key,
 invitation_id uuid references public.elo_invitations(id),
 organization_id uuid not null references public.organizations(id),
 actor_id uuid references auth.users(id),
 action text not null,
 created_at timestamptz not null default now()
);
create index if not exists elo_invitations_recipient_idx on public.elo_invitations(person_id,status,expires_at);
alter table public.elo_invitations enable row level security;
alter table public.elo_congregant_profiles enable row level security;
alter table public.elo_invitation_audit enable row level security;
-- Autenticação: pessoa só pode ler os próprios convites.
create policy elo_invitation_self_read on public.elo_invitations for select to authenticated using (
 exists(select 1 from public.people p where p.id=person_id and p.auth_user_id=auth.uid() and p.organization_id=elo_invitations.organization_id)
);
create policy elo_profile_self_read on public.elo_congregant_profiles for select to authenticated using (
 exists(select 1 from public.people p where p.id=person_id and p.auth_user_id=auth.uid() and p.organization_id=elo_congregant_profiles.organization_id)
);
-- Nenhuma política de INSERT/UPDATE/DELETE no cliente: emissão e aceite apenas via função
-- SECURITY DEFINER auditada, após validação de papel, identidade, expiração e transação.
-- Não promover congregado por UPDATE direto no navegador.
