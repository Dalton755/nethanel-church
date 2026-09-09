-- ============================================================
-- NETHANEL CHURCH
-- Criação transacional de culto
-- ============================================================

create or replace function public.create_service_event(
    p_organization_id uuid,
    p_unit_id uuid,
    p_title text,
    p_starts_at timestamptz,
    p_ends_at timestamptz default null,
    p_location_name text default null,
    p_visibility text default 'members',
    p_theme text default null,
    p_preacher_name text default null,
    p_bible_reference text default null,
    p_livestream_url text default null,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private, pg_temp
as $$
declare
    v_user_id uuid;
    v_event_id uuid := gen_random_uuid();
    v_event_type_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_organization_id is null then
        raise exception 'Organization is required';
    end if;

    if p_unit_id is null then
        raise exception 'Unit is required';
    end if;

    if p_title is null
       or length(trim(p_title)) < 2 then
        raise exception 'Service title is required';
    end if;

    if p_starts_at is null then
        raise exception 'Start date is required';
    end if;

    if p_ends_at is not null
       and p_ends_at < p_starts_at then
        raise exception 'End date cannot be before start date';
    end if;

    if p_visibility not in (
        'public',
        'members',
        'restricted'
    ) then
        raise exception 'Invalid visibility';
    end if;

    -- --------------------------------------------------------
    -- Segurança
    -- --------------------------------------------------------

    if not app_private.has_permission(
        p_organization_id,
        'agenda.manage',
        p_unit_id
    ) then
        raise exception 'Insufficient agenda permission'
            using errcode = '42501';
    end if;

    if not app_private.has_permission(
        p_organization_id,
        'services.manage',
        p_unit_id
    ) then
        raise exception 'Insufficient service permission'
            using errcode = '42501';
    end if;

    -- --------------------------------------------------------
    -- Unidade válida
    -- --------------------------------------------------------

    if not exists (
        select 1
        from public.units u
        where u.id = p_unit_id
          and u.organization_id =
              p_organization_id
          and u.status = 'active'
    ) then
        raise exception
            'Unit does not belong to organization';
    end if;

    -- --------------------------------------------------------
    -- Tipo padrão Culto
    -- --------------------------------------------------------

    select et.id
    into v_event_type_id
    from public.event_types et
    where et.organization_id =
          p_organization_id
      and lower(et.type_key) = 'service'
      and et.is_active = true
    limit 1;

    if v_event_type_id is null then
        raise exception
            'Service event type not configured';
    end if;

    -- --------------------------------------------------------
    -- Evento
    -- --------------------------------------------------------

    insert into public.events (
        id,
        organization_id,
        unit_id,
        event_type_id,
        title,
        starts_at,
        ends_at,
        status,
        visibility,
        location_name,
        created_by
    )
    values (
        v_event_id,
        p_organization_id,
        p_unit_id,
        v_event_type_id,
        trim(p_title),
        p_starts_at,
        p_ends_at,
        'published',
        p_visibility,
        nullif(trim(p_location_name), ''),
        v_user_id
    );

    -- --------------------------------------------------------
    -- Especialização Culto
    -- --------------------------------------------------------

    insert into public.services (
        event_id,
        organization_id,
        theme,
        preacher_name,
        bible_reference,
        livestream_url,
        notes
    )
    values (
        v_event_id,
        p_organization_id,
        nullif(trim(p_theme), ''),
        nullif(trim(p_preacher_name), ''),
        nullif(trim(p_bible_reference), ''),
        nullif(trim(p_livestream_url), ''),
        nullif(trim(p_notes), '')
    );

    -- --------------------------------------------------------
    -- Auditoria
    -- --------------------------------------------------------

    perform app_private.write_audit(
        p_organization_id,
        p_unit_id,
        'service.created',
        'services',
        v_event_id,
        jsonb_build_object(
            'title',
            trim(p_title),
            'starts_at',
            p_starts_at,
            'unit_id',
            p_unit_id
        )
    );

    return jsonb_build_object(
        'event_id', v_event_id,
        'organization_id',
            p_organization_id,
        'unit_id', p_unit_id,
        'title', trim(p_title),
        'starts_at', p_starts_at
    );
end;
$$;

revoke all
on function public.create_service_event(
    uuid,
    uuid,
    text,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    text,
    text,
    text,
    text
)
from public;

revoke all
on function public.create_service_event(
    uuid,
    uuid,
    text,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    text,
    text,
    text,
    text
)
from anon;

grant execute
on function public.create_service_event(
    uuid,
    uuid,
    text,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    text,
    text,
    text,
    text
)
to authenticated;

notify pgrst, 'reload schema';