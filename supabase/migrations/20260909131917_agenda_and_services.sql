-- ============================================================
-- NETHANEL CHURCH
-- Agenda + Cultos
-- ============================================================

-- ============================================================
-- 1. NOVAS PERMISSÕES
-- ============================================================

insert into public.permissions (
    permission_key,
    description,
    permission_scope
)
values
    (
        'agenda.view',
        'Consultar agenda e eventos da organização',
        'organization'
    ),
    (
        'agenda.manage',
        'Criar e administrar eventos da agenda',
        'organization'
    ),
    (
        'services.view',
        'Consultar informações de cultos',
        'organization'
    ),
    (
        'services.manage',
        'Criar e administrar cultos',
        'organization'
    )
on conflict (permission_key) do nothing;

-- ============================================================
-- 2. TIPOS DE EVENTO
-- Configuráveis por organização.
-- ============================================================

create table public.event_types (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    name text not null
        check (length(trim(name)) >= 2),

    type_key text not null,

    category text not null default 'event'
        check (
            category in (
                'service',
                'meeting',
                'rehearsal',
                'class',
                'event',
                'other'
            )
        ),

    is_system boolean not null default false,
    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (id, organization_id)
);

create unique index event_types_org_key_ci_uq
    on public.event_types (
        organization_id,
        lower(type_key)
    );

create index event_types_organization_idx
    on public.event_types (organization_id);

-- ============================================================
-- 3. EVENTOS
-- Base central da agenda.
-- ============================================================

create table public.events (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references public.organizations(id)
        on delete cascade,

    unit_id uuid not null,

    event_type_id uuid,

    title text not null
        check (length(trim(title)) >= 2),

    description text,

    starts_at timestamptz not null,
    ends_at timestamptz,

    all_day boolean not null default false,

    status text not null default 'published'
        check (
            status in (
                'draft',
                'published',
                'cancelled',
                'completed'
            )
        ),

    visibility text not null default 'members'
        check (
            visibility in (
                'public',
                'members',
                'restricted'
            )
        ),

    location_name text,

    address jsonb not null default '{}'::jsonb,

    created_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (id, organization_id),

    constraint events_unit_fk
        foreign key (
            unit_id,
            organization_id
        )
        references public.units(
            id,
            organization_id
        )
        on delete cascade,

    constraint events_type_fk
        foreign key (
            event_type_id,
            organization_id
        )
        references public.event_types(
            id,
            organization_id
        )
        on delete restrict,

    constraint events_dates_ck
        check (
            ends_at is null
            or ends_at >= starts_at
        )
);

create index events_org_start_idx
    on public.events (
        organization_id,
        starts_at
    );

create index events_unit_start_idx
    on public.events (
        organization_id,
        unit_id,
        starts_at
    );

create index events_status_start_idx
    on public.events (
        organization_id,
        status,
        starts_at
    );

-- ============================================================
-- 4. CULTOS
-- Extensão especializada de events.
-- Um culto sempre corresponde a exatamente um evento.
-- ============================================================

create table public.services (
    event_id uuid primary key,

    organization_id uuid not null,

    theme text,
    preacher_name text,
    bible_reference text,

    livestream_url text,

    notes text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint services_event_fk
        foreign key (
            event_id,
            organization_id
        )
        references public.events(
            id,
            organization_id
        )
        on delete cascade
);

create index services_organization_idx
    on public.services (organization_id);

-- ============================================================
-- 5. UPDATED_AT
-- ============================================================

create trigger event_types_set_updated_at
before update on public.event_types
for each row
execute function app_private.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row
execute function app_private.set_updated_at();

create trigger services_set_updated_at
before update on public.services
for each row
execute function app_private.set_updated_at();

-- ============================================================
-- 6. TIPOS PADRÃO DE EVENTO
-- ============================================================

create or replace function app_private.create_default_event_types()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    insert into public.event_types (
        organization_id,
        name,
        type_key,
        category,
        is_system
    )
    values
        (
            new.id,
            'Culto',
            'service',
            'service',
            true
        ),
        (
            new.id,
            'Reunião',
            'meeting',
            'meeting',
            true
        ),
        (
            new.id,
            'Ensaio',
            'rehearsal',
            'rehearsal',
            true
        ),
        (
            new.id,
            'Evento',
            'event',
            'event',
            true
        )
    on conflict do nothing;

    return new;
end;
$$;

create trigger organizations_create_default_event_types
after insert on public.organizations
for each row
execute function app_private.create_default_event_types();

-- Backfill para organizações já existentes.

insert into public.event_types (
    organization_id,
    name,
    type_key,
    category,
    is_system
)
select
    o.id,
    defaults.name,
    defaults.type_key,
    defaults.category,
    true
from public.organizations o
cross join (
    values
        ('Culto', 'service', 'service'),
        ('Reunião', 'meeting', 'meeting'),
        ('Ensaio', 'rehearsal', 'rehearsal'),
        ('Evento', 'event', 'event')
) as defaults(
    name,
    type_key,
    category
)
on conflict do nothing;

-- ============================================================
-- 7. RLS
-- ============================================================

alter table public.event_types
    enable row level security;

alter table public.events
    enable row level security;

alter table public.services
    enable row level security;

-- ------------------------------------------------------------
-- EVENT TYPES
-- ------------------------------------------------------------

create policy "event_types_select_member"
on public.event_types
for select
to authenticated
using (
    app_private.is_org_member(
        organization_id
    )
);

create policy "event_types_insert_manager"
on public.event_types
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'agenda.manage',
        null
    )
);

create policy "event_types_update_manager"
on public.event_types
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'agenda.manage',
        null
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'agenda.manage',
        null
    )
);

create policy "event_types_delete_manager"
on public.event_types
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'agenda.manage',
        null
    )
);

-- ------------------------------------------------------------
-- EVENTS
-- ------------------------------------------------------------

create policy "events_select_member"
on public.events
for select
to authenticated
using (
    app_private.is_org_member(
        organization_id
    )
);

create policy "events_insert_manager"
on public.events
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'agenda.manage',
        unit_id
    )
);

create policy "events_update_manager"
on public.events
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'agenda.manage',
        unit_id
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'agenda.manage',
        unit_id
    )
);

create policy "events_delete_manager"
on public.events
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'agenda.manage',
        unit_id
    )
);

-- ------------------------------------------------------------
-- SERVICES
-- ------------------------------------------------------------

create policy "services_select_member"
on public.services
for select
to authenticated
using (
    app_private.is_org_member(
        organization_id
    )
);

create policy "services_insert_manager"
on public.services
for insert
to authenticated
with check (
    app_private.has_permission(
        organization_id,
        'services.manage',
        null
    )
);

create policy "services_update_manager"
on public.services
for update
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'services.manage',
        null
    )
)
with check (
    app_private.has_permission(
        organization_id,
        'services.manage',
        null
    )
);

create policy "services_delete_manager"
on public.services
for delete
to authenticated
using (
    app_private.has_permission(
        organization_id,
        'services.manage',
        null
    )
);

-- ============================================================
-- 8. GRANTS
-- ============================================================

revoke all
    on public.event_types
    from anon;

revoke all
    on public.events
    from anon;

revoke all
    on public.services
    from anon;

grant select, insert, update, delete
    on public.event_types
    to authenticated;

grant select, insert, update, delete
    on public.events
    to authenticated;

grant select, insert, update, delete
    on public.services
    to authenticated;

notify pgrst, 'reload schema';