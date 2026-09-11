-- ============================================================
-- Nethanel Church
-- Pessoas MVP
-- ============================================================


-- ============================================================
-- LISTAR PESSOAS
-- ============================================================

create or replace function public.list_people(
    p_organization_id uuid,
    p_unit_id uuid
)
returns table (
    id uuid,
    full_name text,
    preferred_name text,
    email text,
    phone text,
    birth_date date,
    record_status text,
    membership_type text,
    unit_relationship_type text,
    unit_membership_status text,
    created_at timestamptz
)
language plpgsql
security definer
stable
set search_path to
    'public',
    'auth',
    'app_private',
    'pg_temp'
as $function$
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if not (
        app_private.has_permission(
            p_organization_id,
            'people.view',
            null
        )
        or
        app_private.has_permission(
            p_organization_id,
            'people.manage',
            null
        )
    ) then
        raise exception 'Insufficient people permission'
            using errcode = '42501';
    end if;

    return query
    select
        p.id,
        p.full_name,
        p.preferred_name,
        p.email,
        p.phone,
        p.birth_date,
        p.record_status,

        om.membership_type,

        um.relationship_type
            as unit_relationship_type,

        um.status
            as unit_membership_status,

        p.created_at

    from public.people p

    join public.organization_memberships om
      on om.organization_id =
            p.organization_id
     and om.person_id =
            p.id

    join public.unit_memberships um
      on um.organization_id =
            p.organization_id
     and um.person_id =
            p.id
     and um.unit_id =
            p_unit_id

    where p.organization_id =
        p_organization_id

    order by
        lower(
            coalesce(
                p.preferred_name,
                p.full_name
            )
        ),
        lower(p.full_name);
end;
$function$;


-- ============================================================
-- CRIAR PESSOA
-- ============================================================

create or replace function public.create_person(
    p_organization_id uuid,
    p_unit_id uuid,
    p_full_name text,
    p_preferred_name text default null,
    p_email text default null,
    p_phone text default null,
    p_birth_date date default null,
    p_membership_type text default 'member'
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
    v_person_id uuid :=
        gen_random_uuid();

    v_unit_relationship_type text;
begin
    v_user_id :=
        auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if not app_private.has_permission(
        p_organization_id,
        'people.manage',
        null
    ) then
        raise exception 'Insufficient people permission'
            using errcode = '42501';
    end if;

    if p_full_name is null
       or length(trim(p_full_name)) < 2 then
        raise exception 'Full name is required';
    end if;

    if p_membership_type not in (
        'visitor',
        'congregant',
        'member',
        'minister',
        'staff',
        'other'
    ) then
        raise exception 'Invalid membership type';
    end if;

    if not exists (
        select 1
        from public.units u
        where u.id =
            p_unit_id
          and u.organization_id =
            p_organization_id
          and u.status =
            'active'
    ) then
        raise exception
            'Unit does not belong to organization';
    end if;


    -- --------------------------------------------------------
    -- Mapear vínculo da organização para vínculo da unidade
    -- --------------------------------------------------------

    v_unit_relationship_type :=
        case p_membership_type
            when 'visitor'
                then 'attendee'

            when 'congregant'
                then 'attendee'

            when 'member'
                then 'member'

            when 'minister'
                then 'leader'

            when 'staff'
                then 'staff'

            else 'other'
        end;


    -- --------------------------------------------------------
    -- Pessoa
    -- --------------------------------------------------------

    insert into public.people (
        id,
        organization_id,
        full_name,
        preferred_name,
        email,
        phone,
        birth_date,
        record_status,
        created_by
    )
    values (
        v_person_id,
        p_organization_id,
        trim(p_full_name),

        nullif(
            trim(p_preferred_name),
            ''
        ),

        nullif(
            lower(trim(p_email)),
            ''
        ),

        nullif(
            trim(p_phone),
            ''
        ),

        p_birth_date,
        'active',
        v_user_id
    );


    -- --------------------------------------------------------
    -- Vínculo com organização
    -- --------------------------------------------------------

    insert into public.organization_memberships (
        organization_id,
        person_id,
        membership_type,
        status,
        started_at
    )
    values (
        p_organization_id,
        v_person_id,
        p_membership_type,
        'active',
        current_date
    );


    -- --------------------------------------------------------
    -- Vínculo com unidade
    -- --------------------------------------------------------

    insert into public.unit_memberships (
        organization_id,
        unit_id,
        person_id,
        relationship_type,
        status,
        started_at
    )
    values (
        p_organization_id,
        p_unit_id,
        v_person_id,
        v_unit_relationship_type,
        'active',
        current_date
    );


    -- --------------------------------------------------------
    -- Auditoria
    -- --------------------------------------------------------

    perform app_private.write_audit(
        p_organization_id,
        p_unit_id,
        'person.created',
        'people',
        v_person_id,
        jsonb_build_object(
            'full_name',
            trim(p_full_name),

            'membership_type',
            p_membership_type,

            'unit_id',
            p_unit_id
        )
    );


    return jsonb_build_object(
        'person_id',
        v_person_id,

        'organization_id',
        p_organization_id,

        'unit_id',
        p_unit_id,

        'full_name',
        trim(p_full_name),

        'membership_type',
        p_membership_type
    );
end;
$function$;


-- ============================================================
-- EDITAR PESSOA
-- ============================================================

create or replace function public.update_person(
    p_person_id uuid,
    p_organization_id uuid,
    p_unit_id uuid,
    p_full_name text,
    p_preferred_name text default null,
    p_email text default null,
    p_phone text default null,
    p_birth_date date default null,
    p_membership_type text default 'member'
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
    v_unit_relationship_type text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if not app_private.has_permission(
        p_organization_id,
        'people.manage',
        null
    ) then
        raise exception 'Insufficient people permission'
            using errcode = '42501';
    end if;

    if p_full_name is null
       or length(trim(p_full_name)) < 2 then
        raise exception 'Full name is required';
    end if;

    if p_membership_type not in (
        'visitor',
        'congregant',
        'member',
        'minister',
        'staff',
        'other'
    ) then
        raise exception 'Invalid membership type';
    end if;

    if not exists (
        select 1
        from public.people p
        where p.id =
            p_person_id
          and p.organization_id =
            p_organization_id
    ) then
        raise exception 'Person not found';
    end if;

    if not exists (
        select 1
        from public.units u
        where u.id =
            p_unit_id
          and u.organization_id =
            p_organization_id
          and u.status =
            'active'
    ) then
        raise exception
            'Unit does not belong to organization';
    end if;


    v_unit_relationship_type :=
        case p_membership_type
            when 'visitor'
                then 'attendee'

            when 'congregant'
                then 'attendee'

            when 'member'
                then 'member'

            when 'minister'
                then 'leader'

            when 'staff'
                then 'staff'

            else 'other'
        end;


    update public.people
    set
        full_name =
            trim(p_full_name),

        preferred_name =
            nullif(
                trim(p_preferred_name),
                ''
            ),

        email =
            nullif(
                lower(trim(p_email)),
                ''
            ),

        phone =
            nullif(
                trim(p_phone),
                ''
            ),

        birth_date =
            p_birth_date,

        updated_at =
            now()

    where id =
        p_person_id
      and organization_id =
        p_organization_id;


    update public.organization_memberships
    set
        membership_type =
            p_membership_type,

        updated_at =
            now()

    where organization_id =
        p_organization_id
      and person_id =
        p_person_id;


    update public.unit_memberships
    set
        relationship_type =
            v_unit_relationship_type,

        updated_at =
            now()

    where organization_id =
        p_organization_id
      and unit_id =
        p_unit_id
      and person_id =
        p_person_id;


    if not found then
        insert into public.unit_memberships (
            organization_id,
            unit_id,
            person_id,
            relationship_type,
            status,
            started_at
        )
        values (
            p_organization_id,
            p_unit_id,
            p_person_id,
            v_unit_relationship_type,
            'active',
            current_date
        );
    end if;


    perform app_private.write_audit(
        p_organization_id,
        p_unit_id,
        'person.updated',
        'people',
        p_person_id,
        jsonb_build_object(
            'full_name',
            trim(p_full_name),

            'membership_type',
            p_membership_type,

            'unit_id',
            p_unit_id
        )
    );


    return jsonb_build_object(
        'person_id',
        p_person_id,

        'organization_id',
        p_organization_id,

        'unit_id',
        p_unit_id,

        'full_name',
        trim(p_full_name),

        'membership_type',
        p_membership_type
    );
end;
$function$;


-- ============================================================
-- ATIVAR / DESATIVAR PESSOA
-- ============================================================

create or replace function public.set_person_active(
    p_person_id uuid,
    p_organization_id uuid,
    p_active boolean
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
    v_unit_id uuid;
    v_new_status text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if not app_private.has_permission(
        p_organization_id,
        'people.manage',
        null
    ) then
        raise exception 'Insufficient people permission'
            using errcode = '42501';
    end if;


    select um.unit_id
    into v_unit_id
    from public.unit_memberships um
    where um.organization_id =
        p_organization_id
      and um.person_id =
        p_person_id
    order by
        case
            when um.status = 'active'
                then 0
            else 1
        end,
        um.created_at
    limit 1;


    if not exists (
        select 1
        from public.people p
        where p.id =
            p_person_id
          and p.organization_id =
            p_organization_id
    ) then
        raise exception 'Person not found';
    end if;


    v_new_status :=
        case
            when p_active
                then 'active'
            else 'inactive'
        end;


    update public.people
    set
        record_status =
            v_new_status,

        updated_at =
            now()

    where id =
        p_person_id
      and organization_id =
        p_organization_id;


    update public.organization_memberships
    set
        status =
            v_new_status,

        ended_at =
            case
                when p_active
                    then null
                else current_date
            end,

        updated_at =
            now()

    where organization_id =
        p_organization_id
      and person_id =
        p_person_id;


    update public.unit_memberships
    set
        status =
            v_new_status,

        ended_at =
            case
                when p_active
                    then null
                else current_date
            end,

        updated_at =
            now()

    where organization_id =
        p_organization_id
      and person_id =
        p_person_id;


    perform app_private.write_audit(
        p_organization_id,
        v_unit_id,
        case
            when p_active
                then 'person.activated'
            else 'person.deactivated'
        end,
        'people',
        p_person_id,
        jsonb_build_object(
            'active',
            p_active
        )
    );


    return jsonb_build_object(
        'person_id',
        p_person_id,

        'active',
        p_active
    );
end;
$function$;


-- ============================================================
-- EXECUTE
-- ============================================================

revoke all
on function public.list_people(
    uuid,
    uuid
)
from public;

grant execute
on function public.list_people(
    uuid,
    uuid
)
to authenticated;


revoke all
on function public.create_person(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    date,
    text
)
from public;

grant execute
on function public.create_person(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    date,
    text
)
to authenticated;


revoke all
on function public.update_person(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    date,
    text
)
from public;

grant execute
on function public.update_person(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    date,
    text
)
to authenticated;


revoke all
on function public.set_person_active(
    uuid,
    uuid,
    boolean
)
from public;

grant execute
on function public.set_person_active(
    uuid,
    uuid,
    boolean
)
to authenticated;


notify pgrst, 'reload schema';