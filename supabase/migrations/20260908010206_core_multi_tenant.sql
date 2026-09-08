-- ============================================================
-- NETHANEL CHURCH
-- Core Multi-Tenant
-- ============================================================
-- Fundação de:
-- - usuários
-- - organizações
-- - unidades
-- - pessoas
-- - vínculos
-- - papéis
-- - permissões
-- - auditoria
-- - RLS
-- ============================================================

create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

-- ============================================================
-- 1. PROFILES
-- Conta global vinculada ao Supabase Auth.
-- Não representa automaticamente um membro da igreja.
-- ============================================================

create table public.profiles (
    user_id uuid primary key
        references auth.users(id)
        on delete cascade,

    display_name text,
    avatar_url text,

    locale text not null default 'pt-BR',
    timezone text not null default 'America/Sao_Paulo',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. ORGANIZATIONS
-- Raiz do tenant.
-- Pode representar uma igreja local ou um ministério inteiro.
-- ============================================================

create table public.organizations (
    id uuid primary key default gen_random_uuid(),

    name text not null
        check (length(trim(name)) >= 2),

    slug text not null,

    status text not null default 'active'
        check (
            status in (
                'active',
                'inactive',
                'suspended',
                'archived'
            )
        ),

    created_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index organizations_slug_ci_uq
    on public.organizations (lower(slug));

-- ============================================================
-- 3. UNITS
-- Sede, congregação, região, campus etc.
-- ============================================================

create table public.units (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    parent_unit_id uuid,

    name text not null
        check (length(trim(name)) >= 2),

    slug text not null,

    unit_type text not null default 'congregation'
        check (
            unit_type in (
                'headquarters',
                'congregation',
                'region',
                'campus',
                'other'
            )
        ),

    is_headquarters boolean not null default false,

    status text not null default 'active'
        check (
            status in (
                'active',
                'inactive',
                'archived'
            )
        ),

    address jsonb not null default '{}'::jsonb,

    timezone text not null default 'America/Sao_Paulo',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (id, organization_id)
);

alter table public.units
    add constraint units_parent_same_organization_fk
    foreign key (parent_unit_id, organization_id)
    references public.units(id, organization_id)
    on delete restrict;

create unique index units_org_slug_ci_uq
    on public.units (
        organization_id,
        lower(slug)
    );

create unique index units_one_headquarters_per_org_uq
    on public.units (organization_id)
    where is_headquarters = true
      and status <> 'archived';

create index units_organization_idx
    on public.units (organization_id);

create index units_parent_idx
    on public.units (parent_unit_id);

-- ============================================================
-- 4. PEOPLE
-- Cadastro da pessoa dentro de uma organização.
--
-- Uma conta Auth pode estar ligada a registros diferentes
-- em organizações diferentes.
-- ============================================================

create table public.people (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    auth_user_id uuid
        references auth.users(id)
        on delete set null,

    full_name text not null
        check (length(trim(full_name)) >= 2),

    preferred_name text,

    email text,
    phone text,

    birth_date date,

    record_status text not null default 'active'
        check (
            record_status in (
                'active',
                'inactive',
                'archived'
            )
        ),

    created_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (id, organization_id)
);

create unique index people_org_auth_user_uq
    on public.people (
        organization_id,
        auth_user_id
    )
    where auth_user_id is not null;

create index people_organization_idx
    on public.people (organization_id);

create index people_auth_user_idx
    on public.people (auth_user_id)
    where auth_user_id is not null;

create index people_name_idx
    on public.people (
        organization_id,
        lower(full_name)
    );

-- ============================================================
-- 5. ORGANIZATION MEMBERSHIPS
-- Situação eclesiástica atual da pessoa na organização.
-- ============================================================

create table public.organization_memberships (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,

    person_id uuid not null,

    membership_type text not null default 'member'
        check (
            membership_type in (
                'visitor',
                'congregant',
                'member',
                'minister',
                'staff',
                'other'
            )
        ),

    status text not null default 'active'
        check (
            status in (
                'pending',
                'active',
                'inactive',
                'transferred',
                'archived'
            )
        ),

    started_at date,
    ended_at date,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint organization_memberships_person_fk
        foreign key (person_id, organization_id)
        references public.people(id, organization_id)
        on delete cascade,

    constraint organization_memberships_one_per_person_uq
        unique (organization_id, person_id),

    constraint organization_memberships_dates_ck
        check (
            ended_at is null
            or started_at is null
            or ended_at >= started_at
        )
);

create index organization_memberships_org_status_idx
    on public.organization_memberships (
        organization_id,
        status
    );

-- ============================================================
-- 6. UNIT MEMBERSHIPS
-- Relação da pessoa com sede, congregação, região etc.
-- ============================================================

create table public.unit_memberships (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,

    unit_id uuid not null,

    person_id uuid not null,

    relationship_type text not null default 'member'
        check (
            relationship_type in (
                'member',
                'attendee',
                'volunteer',
                'leader',
                'staff',
                'other'
            )
        ),

    status text not null default 'active'
        check (
            status in (
                'pending',
                'active',
                'inactive',
                'archived'
            )
        ),

    started_at date,
    ended_at date,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint unit_memberships_unit_fk
        foreign key (unit_id, organization_id)
        references public.units(id, organization_id)
        on delete cascade,

    constraint unit_memberships_person_fk
        foreign key (person_id, organization_id)
        references public.people(id, organization_id)
        on delete cascade,

    constraint unit_memberships_dates_ck
        check (
            ended_at is null
            or started_at is null
            or ended_at >= started_at
        )
);

create unique index unit_memberships_active_relation_uq
    on public.unit_memberships (
        organization_id,
        unit_id,
        person_id,
        relationship_type
    )
    where status in ('pending', 'active');

create index unit_memberships_person_idx
    on public.unit_memberships (
        organization_id,
        person_id
    );

create index unit_memberships_unit_idx
    on public.unit_memberships (
        organization_id,
        unit_id
    );

-- ============================================================
-- 7. ROLES
-- Papéis configuráveis por organização.
-- ============================================================

create table public.roles (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    name text not null,
    role_key text not null,

    description text,

    is_owner boolean not null default false,
    is_system boolean not null default false,
    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (id, organization_id)
);

create unique index roles_org_key_ci_uq
    on public.roles (
        organization_id,
        lower(role_key)
    );

create unique index roles_one_owner_per_org_uq
    on public.roles (organization_id)
    where is_owner = true
      and is_active = true;

create index roles_organization_idx
    on public.roles (organization_id);

-- ============================================================
-- 8. PERMISSIONS
-- Catálogo global de capacidades do sistema.
-- ============================================================

create table public.permissions (
    permission_key text primary key,

    description text not null,

    permission_scope text not null default 'organization'
        check (
            permission_scope in (
                'organization',
                'unit'
            )
        ),

    created_at timestamptz not null default now()
);

insert into public.permissions (
    permission_key,
    description,
    permission_scope
)
values
    (
        'organization.manage',
        'Gerenciar dados e configurações da organização',
        'organization'
    ),
    (
        'units.manage',
        'Gerenciar unidades, congregações e regiões',
        'organization'
    ),
    (
        'people.view',
        'Consultar pessoas da organização',
        'organization'
    ),
    (
        'people.manage',
        'Cadastrar e administrar pessoas e vínculos',
        'organization'
    ),
    (
        'security.manage',
        'Administrar papéis, permissões e acessos',
        'organization'
    ),
    (
        'audit.view',
        'Consultar registros de auditoria',
        'organization'
    )
on conflict (permission_key) do nothing;

-- ============================================================
-- 9. ROLE PERMISSIONS
-- ============================================================

create table public.role_permissions (
    role_id uuid not null
        references public.roles(id)
        on delete cascade,

    permission_key text not null
        references public.permissions(permission_key)
        on delete cascade,

    created_at timestamptz not null default now(),

    primary key (
        role_id,
        permission_key
    )
);

create index role_permissions_permission_idx
    on public.role_permissions (permission_key);

-- ============================================================
-- 10. USER ROLE ASSIGNMENTS
-- Papel atribuído a uma pessoa.
--
-- unit_id NULL = papel para toda organização.
-- unit_id preenchido = papel restrito à unidade.
-- ============================================================

create table public.user_role_assignments (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,

    person_id uuid not null,

    role_id uuid not null,

    unit_id uuid,

    is_active boolean not null default true,

    starts_at timestamptz not null default now(),
    ends_at timestamptz,

    created_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint user_role_assignments_person_fk
        foreign key (person_id, organization_id)
        references public.people(id, organization_id)
        on delete cascade,

    constraint user_role_assignments_role_fk
        foreign key (role_id, organization_id)
        references public.roles(id, organization_id)
        on delete cascade,

    constraint user_role_assignments_unit_fk
        foreign key (unit_id, organization_id)
        references public.units(id, organization_id)
        on delete cascade,

    constraint user_role_assignments_dates_ck
        check (
            ends_at is null
            or ends_at >= starts_at
        )
);

create unique index user_role_assignments_active_uq
    on public.user_role_assignments (
        organization_id,
        person_id,
        role_id,
        coalesce(
            unit_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        )
    )
    where is_active = true;

create index user_role_assignments_person_idx
    on public.user_role_assignments (
        organization_id,
        person_id
    );

create index user_role_assignments_role_idx
    on public.user_role_assignments (
        organization_id,
        role_id
    );

-- ============================================================
-- 11. AUDIT LOG
-- Inicialmente sem guardar conteúdo sensível completo.
-- ============================================================

create table public.audit_log (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid
        references public.organizations(id)
        on delete set null,

    unit_id uuid,

    actor_user_id uuid
        references auth.users(id)
        on delete set null,

    action text not null,
    entity_table text not null,
    entity_id uuid,

    metadata jsonb not null default '{}'::jsonb,

    occurred_at timestamptz not null default now()
);

create index audit_log_org_time_idx
    on public.audit_log (
        organization_id,
        occurred_at desc
    );

create index audit_log_actor_idx
    on public.audit_log (
        actor_user_id,
        occurred_at desc
    );

-- ============================================================
-- 12. UPDATED_AT
-- ============================================================

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function app_private.set_updated_at();

create trigger units_set_updated_at
before update on public.units
for each row execute function app_private.set_updated_at();

create trigger people_set_updated_at
before update on public.people
for each row execute function app_private.set_updated_at();

create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function app_private.set_updated_at();

create trigger unit_memberships_set_updated_at
before update on public.unit_memberships
for each row execute function app_private.set_updated_at();

create trigger roles_set_updated_at
before update on public.roles
for each row execute function app_private.set_updated_at();

create trigger user_role_assignments_set_updated_at
before update on public.user_role_assignments
for each row execute function app_private.set_updated_at();

-- ============================================================
-- 13. PROFILE AUTOMÁTICO AO CRIAR USUÁRIO
-- ============================================================

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
    insert into public.profiles (
        user_id,
        display_name
    )
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name',
            split_part(new.email, '@', 1)
        )
    )
    on conflict (user_id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function app_private.handle_new_user();

-- ============================================================
-- 14. FUNÇÕES INTERNAS DE SEGURANÇA
-- ============================================================

create or replace function app_private.current_person_id(
    p_organization_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
    select p.id
    from public.people p
    join public.organization_memberships om
      on om.person_id = p.id
     and om.organization_id = p.organization_id
    where p.organization_id = p_organization_id
      and p.auth_user_id = auth.uid()
      and p.record_status = 'active'
      and om.status = 'active'
    limit 1;
$$;

create or replace function app_private.is_org_member(
    p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
    select exists (
        select 1
        from public.people p
        join public.organization_memberships om
          on om.person_id = p.id
         and om.organization_id = p.organization_id
        where p.organization_id = p_organization_id
          and p.auth_user_id = auth.uid()
          and p.record_status = 'active'
          and om.status = 'active'
    );
$$;

create or replace function app_private.is_person_self(
    p_person_id uuid,
    p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
    select exists (
        select 1
        from public.people p
        where p.id = p_person_id
          and p.organization_id = p_organization_id
          and p.auth_user_id = auth.uid()
          and p.record_status = 'active'
    );
$$;

create or replace function app_private.has_permission(
    p_organization_id uuid,
    p_permission_key text,
    p_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
    select
        app_private.is_org_member(p_organization_id)
        and exists (
            select 1
            from public.people p
            join public.user_role_assignments ura
              on ura.person_id = p.id
             and ura.organization_id = p.organization_id
            join public.roles r
              on r.id = ura.role_id
             and r.organization_id = ura.organization_id
            left join public.role_permissions rp
              on rp.role_id = r.id
            where p.organization_id = p_organization_id
              and p.auth_user_id = auth.uid()
              and p.record_status = 'active'

              and ura.is_active = true
              and ura.starts_at <= now()
              and (
                  ura.ends_at is null
                  or ura.ends_at >= now()
              )

              and r.is_active = true

              and (
                  p_unit_id is null
                  and ura.unit_id is null

                  or

                  p_unit_id is not null
                  and (
                      ura.unit_id is null
                      or ura.unit_id = p_unit_id
                  )
              )

              and (
                  r.is_owner = true
                  or rp.permission_key = p_permission_key
              )
        );
$$;

-- ============================================================
-- 15. AUDITORIA INTERNA
-- ============================================================

create or replace function app_private.write_audit(
    p_organization_id uuid,
    p_unit_id uuid,
    p_action text,
    p_entity_table text,
    p_entity_id uuid,
    p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
    insert into public.audit_log (
        organization_id,
        unit_id,
        actor_user_id,
        action,
        entity_table,
        entity_id,
        metadata
    )
    values (
        p_organization_id,
        p_unit_id,
        auth.uid(),
        p_action,
        p_entity_table,
        p_entity_id,
        coalesce(p_metadata, '{}'::jsonb)
    );
end;
$$;

-- ============================================================
-- 16. RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.units enable row level security;
alter table public.people enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.unit_memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.audit_log enable row level security;

-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------

create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (
    user_id = auth.uid()
);

create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (
    user_id = auth.uid()
);

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (
    user_id = auth.uid()
)
with check (
    user_id = auth.uid()
);

-- ------------------------------------------------------------
-- ORGANIZATIONS
-- ------------------------------------------------------------

create policy "organizations_select_member"
on public.organizations
for select
to authenticated
using (
    app_private.is_org_member(id)
);

create policy "organizations_update_manager"
on public.organizations
for update
to authenticated
using (
    app_private.has_permission(
        id,
        'organization.manage',
        null
    )
)
with check (
    app_private.has_permission(
        id,
        'organization.manage',
        null
    )
);

-- ------------------------------------------------------------
-- UNITS
-- ------------------------------------------------------------

create policy "units_select_org_member"
on public.units
for select
to authenticated
using (
    app_private.is_org_member(organization_id)
);

create policy "units_insert_manager"
on public.units
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'units.manage',
        null
    )
);

create policy "units_update_manager"
on public.units
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'units.manage',
        id
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'units.manage',
        id
    )
);

create policy "units_delete_manager"
on public.units
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'units.manage',
        id
    )
);

-- ------------------------------------------------------------
-- PEOPLE
-- ------------------------------------------------------------

create policy "people_select_allowed"
on public.people
for select
to authenticated
using (
    auth_user_id = auth.uid()
    or app_private.has_permission(
        organization_id,
        'people.view',
        null
    )
);

create policy "people_insert_manager"
on public.people
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
);

create policy "people_update_manager"
on public.people
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
);

create policy "people_delete_manager"
on public.people
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
);

-- ------------------------------------------------------------
-- ORGANIZATION MEMBERSHIPS
-- ------------------------------------------------------------

create policy "organization_memberships_select_allowed"
on public.organization_memberships
for select
to authenticated
using (
    app_private.is_person_self(
        person_id,
        organization_id
    )
    or app_private.has_permission(
        organization_id,
        'people.view',
        null
    )
);

create policy "organization_memberships_insert_manager"
on public.organization_memberships
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
);

create policy "organization_memberships_update_manager"
on public.organization_memberships
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
);

create policy "organization_memberships_delete_manager"
on public.organization_memberships
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
);

-- ------------------------------------------------------------
-- UNIT MEMBERSHIPS
-- ------------------------------------------------------------

create policy "unit_memberships_select_allowed"
on public.unit_memberships
for select
to authenticated
using (
    app_private.is_person_self(
        person_id,
        organization_id
    )
    or app_private.has_permission(
        organization_id,
        'people.view',
        null
    )
    or app_private.has_permission(
        organization_id,
        'units.manage',
        unit_id
    )
);

create policy "unit_memberships_insert_manager"
on public.unit_memberships
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
    or app_private.has_permission(
        organization_id,
        'units.manage',
        unit_id
    )
);

create policy "unit_memberships_update_manager"
on public.unit_memberships
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
    or app_private.has_permission(
        organization_id,
        'units.manage',
        unit_id
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
    or app_private.has_permission(
        organization_id,
        'units.manage',
        unit_id
    )
);

create policy "unit_memberships_delete_manager"
on public.unit_memberships
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'people.manage',
        null
    )
    or app_private.has_permission(
        organization_id,
        'units.manage',
        unit_id
    )
);

-- ------------------------------------------------------------
-- ROLES
-- ------------------------------------------------------------

create policy "roles_select_org_member"
on public.roles
for select
to authenticated
using (
    app_private.is_org_member(organization_id)
);

create policy "roles_insert_security_manager"
on public.roles
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
);

create policy "roles_update_security_manager"
on public.roles
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
);

create policy "roles_delete_security_manager"
on public.roles
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
);

-- ------------------------------------------------------------
-- PERMISSIONS
-- Catálogo pode ser lido por usuários autenticados.
-- Não pode ser alterado pelo cliente.
-- ------------------------------------------------------------

create policy "permissions_select_authenticated"
on public.permissions
for select
to authenticated
using (true);

-- ------------------------------------------------------------
-- ROLE PERMISSIONS
-- ------------------------------------------------------------

create policy "role_permissions_select_security_manager"
on public.role_permissions
for select
to authenticated
using (
    exists (
        select 1
        from public.roles r
        where r.id = role_permissions.role_id
          and app_private.has_permission(
              r.organization_id,
              'security.manage',
              null
          )
    )
);

create policy "role_permissions_insert_security_manager"
on public.role_permissions
for insert
to authenticated
with check (
    exists (
        select 1
        from public.roles r
        where r.id = role_permissions.role_id
          and app_private.has_permission(
              r.organization_id,
              'security.manage',
              null
          )
    )
);

create policy "role_permissions_delete_security_manager"
on public.role_permissions
for delete
to authenticated
using (
    exists (
        select 1
        from public.roles r
        where r.id = role_permissions.role_id
          and app_private.has_permission(
              r.organization_id,
              'security.manage',
              null
          )
    )
);

-- ------------------------------------------------------------
-- USER ROLE ASSIGNMENTS
-- ------------------------------------------------------------

create policy "user_role_assignments_select_allowed"
on public.user_role_assignments
for select
to authenticated
using (
    app_private.is_person_self(
        person_id,
        organization_id
    )
    or app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
);

create policy "user_role_assignments_insert_security_manager"
on public.user_role_assignments
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
);

create policy "user_role_assignments_update_security_manager"
on public.user_role_assignments
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
);

create policy "user_role_assignments_delete_security_manager"
on public.user_role_assignments
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'security.manage',
        null
    )
);

-- ------------------------------------------------------------
-- AUDIT LOG
-- Sem INSERT / UPDATE / DELETE direto pelo cliente.
-- ------------------------------------------------------------

create policy "audit_log_select_authorized"
on public.audit_log
for select
to authenticated
using (
    organization_id is not null
    and app_private.has_permission(
        organization_id,
        'audit.view',
        null
    )
);

-- ============================================================
-- 17. CRIAÇÃO TRANSACIONAL DA PRIMEIRA ORGANIZAÇÃO
-- ============================================================

create or replace function app_private.slugify(
    p_value text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
    select trim(
        both '-'
        from regexp_replace(
            translate(
                lower(trim(p_value)),
                'áàãâäéèêëíìîïóòõôöúùûüç',
                'aaaaaeeeeiiiiooooouuuuc'
            ),
            '[^a-z0-9]+',
            '-',
            'g'
        )
    );
$$;

create or replace function public.create_organization(
    p_name text,
    p_unit_name text default null,
    p_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private, pg_temp
as $$
declare
    v_user_id uuid;
    v_org_id uuid := gen_random_uuid();
    v_person_id uuid := gen_random_uuid();
    v_unit_id uuid := gen_random_uuid();
    v_role_id uuid := gen_random_uuid();

    v_slug text;
    v_full_name text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required';
    end if;

    if p_name is null
       or length(trim(p_name)) < 2 then
        raise exception 'Organization name is required';
    end if;

    v_slug := app_private.slugify(
        coalesce(
            nullif(trim(p_slug), ''),
            p_name
        )
    );

    if v_slug is null
       or v_slug = '' then
        v_slug := 'church';
    end if;

    if exists (
        select 1
        from public.organizations o
        where lower(o.slug) = lower(v_slug)
    ) then
        v_slug :=
            v_slug
            || '-'
            || substring(v_org_id::text, 1, 8);
    end if;

    select coalesce(
        nullif(trim(p.display_name), ''),
        nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
        split_part(u.email, '@', 1),
        'Usuário'
    )
    into v_full_name
    from auth.users u
    left join public.profiles p
      on p.user_id = u.id
    where u.id = v_user_id;

    insert into public.organizations (
        id,
        name,
        slug,
        created_by
    )
    values (
        v_org_id,
        trim(p_name),
        v_slug,
        v_user_id
    );

    insert into public.people (
        id,
        organization_id,
        auth_user_id,
        full_name,
        email,
        created_by
    )
    select
        v_person_id,
        v_org_id,
        v_user_id,
        v_full_name,
        u.email,
        v_user_id
    from auth.users u
    where u.id = v_user_id;

    insert into public.organization_memberships (
        organization_id,
        person_id,
        membership_type,
        status,
        started_at
    )
    values (
        v_org_id,
        v_person_id,
        'member',
        'active',
        current_date
    );

    insert into public.units (
        id,
        organization_id,
        name,
        slug,
        unit_type,
        is_headquarters
    )
    values (
        v_unit_id,
        v_org_id,
        coalesce(
            nullif(trim(p_unit_name), ''),
            trim(p_name)
        ),
        'sede',
        'headquarters',
        true
    );

    insert into public.unit_memberships (
        organization_id,
        unit_id,
        person_id,
        relationship_type,
        status,
        started_at
    )
    values (
        v_org_id,
        v_unit_id,
        v_person_id,
        'member',
        'active',
        current_date
    );

    insert into public.roles (
        id,
        organization_id,
        name,
        role_key,
        description,
        is_owner,
        is_system
    )
    values (
        v_role_id,
        v_org_id,
        'Proprietário',
        'owner',
        'Acesso administrativo total à organização.',
        true,
        true
    );

    insert into public.user_role_assignments (
        organization_id,
        person_id,
        role_id,
        unit_id,
        created_by
    )
    values (
        v_org_id,
        v_person_id,
        v_role_id,
        null,
        v_user_id
    );

    perform app_private.write_audit(
        v_org_id,
        v_unit_id,
        'organization.created',
        'organizations',
        v_org_id,
        jsonb_build_object(
            'organization_name',
            trim(p_name),
            'unit_id',
            v_unit_id
        )
    );

    return jsonb_build_object(
        'organization_id', v_org_id,
        'unit_id', v_unit_id,
        'person_id', v_person_id,
        'owner_role_id', v_role_id,
        'slug', v_slug
    );
end;
$$;

-- ============================================================
-- 18. PRIVILÉGIOS
-- RLS define as linhas permitidas.
-- GRANT define quais operações chegam às tabelas.
-- ============================================================

revoke all on public.profiles from anon;
revoke all on public.organizations from anon;
revoke all on public.units from anon;
revoke all on public.people from anon;
revoke all on public.organization_memberships from anon;
revoke all on public.unit_memberships from anon;
revoke all on public.roles from anon;
revoke all on public.permissions from anon;
revoke all on public.role_permissions from anon;
revoke all on public.user_role_assignments from anon;
revoke all on public.audit_log from anon;

grant select, insert, update
    on public.profiles
    to authenticated;

grant select, update
    on public.organizations
    to authenticated;

grant select, insert, update, delete
    on public.units
    to authenticated;

grant select, insert, update, delete
    on public.people
    to authenticated;

grant select, insert, update, delete
    on public.organization_memberships
    to authenticated;

grant select, insert, update, delete
    on public.unit_memberships
    to authenticated;

grant select, insert, update, delete
    on public.roles
    to authenticated;

grant select
    on public.permissions
    to authenticated;

grant select, insert, delete
    on public.role_permissions
    to authenticated;

grant select, insert, update, delete
    on public.user_role_assignments
    to authenticated;

grant select
    on public.audit_log
    to authenticated;

revoke all on function public.create_organization(
    text,
    text,
    text
) from public;

grant execute on function public.create_organization(
    text,
    text,
    text
) to authenticated;

revoke all on function app_private.current_person_id(uuid)
    from public;

revoke all on function app_private.is_org_member(uuid)
    from public;

revoke all on function app_private.is_person_self(uuid, uuid)
    from public;

revoke all on function app_private.has_permission(uuid, text, uuid)
    from public;

grant execute on function app_private.current_person_id(uuid)
    to authenticated;

grant execute on function app_private.is_org_member(uuid)
    to authenticated;

grant execute on function app_private.is_person_self(uuid, uuid)
    to authenticated;

grant execute on function app_private.has_permission(uuid, text, uuid)
    to authenticated;

-- ============================================================
-- FIM
-- ============================================================