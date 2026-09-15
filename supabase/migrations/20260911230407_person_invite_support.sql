-- ============================================================
-- Nethanel Church
-- Suporte ao convite de pessoas
-- ============================================================


-- Uma conta Auth só pode representar uma pessoa
-- dentro da mesma organização.
create unique index if not exists
    people_org_auth_user_uq
on public.people (
    organization_id,
    auth_user_id
)
where auth_user_id is not null;


-- ============================================================
-- OBTER DESTINO DO CONVITE
-- ============================================================

create or replace function public.get_person_invite_target(
    p_organization_id uuid,
    p_person_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to
    'public',
    'auth',
    'app_private',
    'pg_temp'
as $function$
declare
    v_person public.people%rowtype;

    v_existing_auth_user_id uuid;
begin

    if auth.uid() is null then
        raise exception
            'Authentication required'
            using errcode = '28000';
    end if;


    if not app_private.has_permission(
        p_organization_id,
        'security.manage',
        null
    ) then
        raise exception
            'Insufficient security permission'
            using errcode = '42501';
    end if;


    select p.*
    into v_person
    from public.people p
    where
        p.id = p_person_id
        and p.organization_id = p_organization_id
        and p.record_status = 'active';


    if not found then
        raise exception
            'Person not found or inactive';
    end if;


    if v_person.email is null
       or length(trim(v_person.email)) = 0 then

        raise exception
            'Person does not have an email address';
    end if;


    /*
     * Pode existir uma conta Auth com o mesmo e-mail
     * criada anteriormente em outra organização.
     */
    select u.id
    into v_existing_auth_user_id
    from auth.users u
    where lower(u.email) =
          lower(trim(v_person.email))
    order by u.created_at
    limit 1;


    return jsonb_build_object(
        'person_id',
            v_person.id,

        'full_name',
            v_person.full_name,

        'email',
            trim(v_person.email),

        'current_auth_user_id',
            v_person.auth_user_id,

        'existing_auth_user_id',
            v_existing_auth_user_id
    );

end;
$function$;


-- ============================================================
-- VINCULAR CONTA AUTH À PESSOA
-- ============================================================

create or replace function public.link_person_auth_user(
    p_organization_id uuid,
    p_person_id uuid,
    p_auth_user_id uuid
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
    v_person public.people%rowtype;

    v_auth_email text;
begin

    if auth.uid() is null then
        raise exception
            'Authentication required'
            using errcode = '28000';
    end if;


    if not app_private.has_permission(
        p_organization_id,
        'security.manage',
        null
    ) then
        raise exception
            'Insufficient security permission'
            using errcode = '42501';
    end if;


    select p.*
    into v_person
    from public.people p
    where
        p.id = p_person_id
        and p.organization_id = p_organization_id
        and p.record_status = 'active'
    for update;


    if not found then
        raise exception
            'Person not found or inactive';
    end if;


    if v_person.email is null
       or length(trim(v_person.email)) = 0 then

        raise exception
            'Person does not have an email address';
    end if;


    select u.email
    into v_auth_email
    from auth.users u
    where u.id = p_auth_user_id;


    if not found then
        raise exception
            'Authentication user not found';
    end if;


    if lower(trim(v_auth_email)) <>
       lower(trim(v_person.email)) then

        raise exception
            'Authentication email does not match person email'
            using errcode = '42501';
    end if;


    /*
     * Não permitir a mesma conta Auth em duas pessoas
     * diferentes da mesma organização.
     */
    if exists (
        select 1
        from public.people p
        where
            p.organization_id =
                p_organization_id

            and p.auth_user_id =
                p_auth_user_id

            and p.id <>
                p_person_id
    ) then

        raise exception
            'Authentication user is already linked to another person in this organization';
    end if;


    update public.people
    set
        auth_user_id =
            p_auth_user_id,

        updated_at =
            now()
    where
        id =
            p_person_id

        and organization_id =
            p_organization_id;


    perform app_private.write_audit(
        p_organization_id,
        null,
        'person_access.auth_linked',
        'people',
        p_person_id,

        jsonb_build_object(
            'person_id',
                p_person_id,

            'auth_user_id',
                p_auth_user_id,

            'email',
                v_auth_email
        )
    );


    return jsonb_build_object(
        'person_id',
            p_person_id,

        'auth_user_id',
            p_auth_user_id,

        'email',
            v_auth_email,

        'linked',
            true
    );

end;
$function$;


revoke all
on function public.get_person_invite_target(
    uuid,
    uuid
)
from public;

grant execute
on function public.get_person_invite_target(
    uuid,
    uuid
)
to authenticated;


revoke all
on function public.link_person_auth_user(
    uuid,
    uuid,
    uuid
)
from public;

grant execute
on function public.link_person_auth_user(
    uuid,
    uuid,
    uuid
)
to authenticated;


notify pgrst, 'reload schema';