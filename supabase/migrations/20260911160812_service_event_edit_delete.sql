-- ============================================================
-- Nethanel Church
-- Editar e excluir cultos
-- ============================================================


-- ============================================================
-- EDITAR CULTO
-- ============================================================

create or replace function public.update_service_event(
    p_event_id uuid,
    p_organization_id uuid,
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
set search_path to
    'public',
    'auth',
    'app_private',
    'pg_temp'
as $function$
declare
    v_user_id uuid;
    v_unit_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_event_id is null then
        raise exception 'Event is required';
    end if;

    if p_organization_id is null then
        raise exception 'Organization is required';
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
        raise exception
            'End date cannot be before start date';
    end if;

    if p_visibility not in (
        'public',
        'members',
        'restricted'
    ) then
        raise exception 'Invalid visibility';
    end if;


    -- --------------------------------------------------------
    -- Localizar culto
    -- --------------------------------------------------------

    select e.unit_id
    into v_unit_id
    from public.events e
    join public.event_types et
      on et.id = e.event_type_id
    where e.id = p_event_id
      and e.organization_id =
          p_organization_id
      and lower(et.type_key) =
          'service'
    for update;

    if not found then
        raise exception
            'Service event not found';
    end if;


    -- --------------------------------------------------------
    -- Permissões
    -- --------------------------------------------------------

    if not app_private.has_permission(
        p_organization_id,
        'agenda.manage',
        v_unit_id
    ) then
        raise exception
            'Insufficient agenda permission'
            using errcode = '42501';
    end if;

    if not app_private.has_permission(
        p_organization_id,
        'services.manage',
        v_unit_id
    ) then
        raise exception
            'Insufficient service permission'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Atualizar evento
    -- --------------------------------------------------------

    update public.events
    set
        title =
            trim(p_title),

        starts_at =
            p_starts_at,

        ends_at =
            p_ends_at,

        location_name =
            nullif(
                trim(p_location_name),
                ''
            ),

        visibility =
            p_visibility,

        updated_at =
            now()
    where id = p_event_id
      and organization_id =
          p_organization_id;


    -- --------------------------------------------------------
    -- Atualizar informações do culto
    -- --------------------------------------------------------

    update public.services
    set
        theme =
            nullif(
                trim(p_theme),
                ''
            ),

        preacher_name =
            nullif(
                trim(p_preacher_name),
                ''
            ),

        bible_reference =
            nullif(
                trim(p_bible_reference),
                ''
            ),

        livestream_url =
            nullif(
                trim(p_livestream_url),
                ''
            ),

        notes =
            nullif(
                trim(p_notes),
                ''
            ),

        updated_at =
            now()
    where event_id =
        p_event_id
      and organization_id =
        p_organization_id;

    if not found then
        raise exception
            'Service details not found';
    end if;


    -- --------------------------------------------------------
    -- Auditoria
    -- --------------------------------------------------------

    perform app_private.write_audit(
        p_organization_id,
        v_unit_id,
        'service.updated',
        'services',
        p_event_id,
        jsonb_build_object(
            'title',
            trim(p_title),

            'starts_at',
            p_starts_at,

            'ends_at',
            p_ends_at,

            'unit_id',
            v_unit_id
        )
    );


    return jsonb_build_object(
        'event_id',
        p_event_id,

        'organization_id',
        p_organization_id,

        'unit_id',
        v_unit_id,

        'title',
        trim(p_title),

        'starts_at',
        p_starts_at
    );
end;
$function$;


-- ============================================================
-- EXCLUIR CULTO
-- ============================================================

create or replace function public.delete_service_event(
    p_event_id uuid,
    p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to
    'public',
    'auth',
    'app_private',
    'pg_temp'
as $function$
declare
    v_user_id uuid;
    v_unit_id uuid;
    v_title text;
    v_starts_at timestamptz;
    v_cover_image_path text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_event_id is null then
        raise exception 'Event is required';
    end if;

    if p_organization_id is null then
        raise exception 'Organization is required';
    end if;


    -- --------------------------------------------------------
    -- Localizar culto
    -- --------------------------------------------------------

    select
        e.unit_id,
        e.title,
        e.starts_at,
        e.cover_image_path
    into
        v_unit_id,
        v_title,
        v_starts_at,
        v_cover_image_path
    from public.events e
    join public.event_types et
      on et.id = e.event_type_id
    where e.id = p_event_id
      and e.organization_id =
          p_organization_id
      and lower(et.type_key) =
          'service'
    for update;

    if not found then
        raise exception
            'Service event not found';
    end if;


    -- --------------------------------------------------------
    -- Permissões
    -- --------------------------------------------------------

    if not app_private.has_permission(
        p_organization_id,
        'agenda.manage',
        v_unit_id
    ) then
        raise exception
            'Insufficient agenda permission'
            using errcode = '42501';
    end if;

    if not app_private.has_permission(
        p_organization_id,
        'services.manage',
        v_unit_id
    ) then
        raise exception
            'Insufficient service permission'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Auditoria antes da exclusão
    -- --------------------------------------------------------

    perform app_private.write_audit(
        p_organization_id,
        v_unit_id,
        'service.deleted',
        'services',
        p_event_id,
        jsonb_build_object(
            'title',
            v_title,

            'starts_at',
            v_starts_at,

            'unit_id',
            v_unit_id,

            'cover_image_path',
            v_cover_image_path
        )
    );


    -- --------------------------------------------------------
    -- Exclusão
    --
    -- services será removido pelo ON DELETE CASCADE.
    -- --------------------------------------------------------

    delete from public.events
    where id =
        p_event_id
      and organization_id =
        p_organization_id;


    return jsonb_build_object(
        'event_id',
        p_event_id,

        'organization_id',
        p_organization_id,

        'unit_id',
        v_unit_id,

        'title',
        v_title,

        'cover_image_path',
        v_cover_image_path
    );
end;
$function$;


-- ============================================================
-- Permissões das RPCs
-- ============================================================

revoke all
on function public.update_service_event(
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

grant execute
on function public.update_service_event(
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


revoke all
on function public.delete_service_event(
    uuid,
    uuid
)
from public;

grant execute
on function public.delete_service_event(
    uuid,
    uuid
)
to authenticated;


notify pgrst, 'reload schema';