-- ============================================================
-- Nethanel Church
-- Gestão de Perfis de Acesso
-- ============================================================


-- ============================================================
-- Evitar nomes duplicados dentro da mesma organização
-- ============================================================

create unique index if not exists
    roles_org_name_ci_uq
on public.roles (
    organization_id,
    lower(name)
);


-- ============================================================
-- LISTAR PERFIS DE ACESSO
-- ============================================================

create or replace function public.list_access_roles(
    p_organization_id uuid
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


    return jsonb_build_object(

        'roles',

        coalesce(
            (
                select jsonb_agg(
                    role_data
                    order by
                        (role_data ->> 'is_owner')::boolean desc,
                        role_data ->> 'name'
                )

                from (
                    select jsonb_build_object(

                        'id',
                        r.id,

                        'name',
                        r.name,

                        'role_key',
                        r.role_key,

                        'description',
                        r.description,

                        'is_owner',
                        r.is_owner,

                        'is_system',
                        r.is_system,

                        'is_active',
                        r.is_active,

                        'assigned_count',
                        (
                            select count(*)

                            from public.user_role_assignments ura

                            where
                                ura.organization_id =
                                    r.organization_id

                                and ura.role_id =
                                    r.id

                                and ura.is_active =
                                    true

                                and ura.starts_at <=
                                    now()

                                and (
                                    ura.ends_at is null
                                    or ura.ends_at >= now()
                                )
                        ),

                        'permissions',

                        case
                            when r.is_owner = true then

                                coalesce(
                                    (
                                        select jsonb_agg(
                                            p.permission_key
                                            order by
                                                p.permission_key
                                        )

                                        from public.permissions p
                                    ),
                                    '[]'::jsonb
                                )

                            else

                                coalesce(
                                    (
                                        select jsonb_agg(
                                            rp.permission_key
                                            order by
                                                rp.permission_key
                                        )

                                        from public.role_permissions rp

                                        where
                                            rp.role_id =
                                                r.id
                                    ),
                                    '[]'::jsonb
                                )

                        end

                    ) as role_data

                    from public.roles r

                    where
                        r.organization_id =
                            p_organization_id

                ) role_query
            ),

            '[]'::jsonb
        ),

        'permissions',

        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'permission_key',
                            p.permission_key,

                        'description',
                            p.description,

                        'permission_scope',
                            p.permission_scope
                    )

                    order by
                        p.permission_key
                )

                from public.permissions p
            ),

            '[]'::jsonb
        )
    );

end;
$function$;


-- ============================================================
-- CRIAR / EDITAR PERFIL
-- ============================================================

create or replace function public.save_access_role(
    p_organization_id uuid,
    p_role_id uuid,
    p_name text,
    p_description text,
    p_permission_keys text[]
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
    v_role_id uuid;

    v_role_key text;

    v_permissions text[] :=
        coalesce(
            p_permission_keys,
            '{}'::text[]
        );

    v_is_owner boolean;

    v_is_system boolean;

    v_action text;
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


    if p_name is null
       or length(trim(p_name)) < 2 then

        raise exception
            'Role name is required';
    end if;


    -- --------------------------------------------------------
    -- Validar catálogo de permissões
    -- --------------------------------------------------------

    if exists (
        select 1

        from unnest(
            v_permissions
        ) as requested(
            permission_key
        )

        where not exists (
            select 1

            from public.permissions p

            where
                p.permission_key =
                    requested.permission_key
        )
    ) then

        raise exception
            'Invalid permission key';
    end if;


    -- --------------------------------------------------------
    -- CRIAÇÃO
    -- --------------------------------------------------------

    if p_role_id is null then

        v_role_id :=
            gen_random_uuid();


        v_role_key :=
            'custom_' ||
            substr(
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                ),
                1,
                16
            );


        insert into public.roles (
            id,
            organization_id,
            name,
            role_key,
            description,
            is_owner,
            is_system,
            is_active
        )
        values (
            v_role_id,
            p_organization_id,
            trim(p_name),
            v_role_key,

            nullif(
                trim(p_description),
                ''
            ),

            false,
            false,
            true
        );


        v_action :=
            'access_role.created';


    -- --------------------------------------------------------
    -- EDIÇÃO
    -- --------------------------------------------------------

    else

        select
            r.is_owner,
            r.is_system

        into
            v_is_owner,
            v_is_system

        from public.roles r

        where
            r.id =
                p_role_id

            and r.organization_id =
                p_organization_id

        for update;


        if not found then
            raise exception
                'Role not found';
        end if;


        if v_is_owner = true then
            raise exception
                'Owner role cannot be edited'
                using errcode = '42501';
        end if;


        if v_is_system = true then
            raise exception
                'System role cannot be edited'
                using errcode = '42501';
        end if;


        v_role_id :=
            p_role_id;


        update public.roles
        set
            name =
                trim(p_name),

            description =
                nullif(
                    trim(p_description),
                    ''
                ),

            updated_at =
                now()

        where
            id =
                v_role_id

            and organization_id =
                p_organization_id;


        v_action :=
            'access_role.updated';

    end if;


    -- --------------------------------------------------------
    -- Substituir matriz de permissões
    -- --------------------------------------------------------

    delete from public.role_permissions
    where
        role_id =
            v_role_id;


    insert into public.role_permissions (
        role_id,
        permission_key
    )

    select distinct
        v_role_id,
        requested.permission_key

    from unnest(
        v_permissions
    ) as requested(
        permission_key
    );


    -- --------------------------------------------------------
    -- Auditoria
    -- --------------------------------------------------------

    perform app_private.write_audit(
        p_organization_id,
        null,
        v_action,
        'roles',
        v_role_id,

        jsonb_build_object(
            'name',
                trim(p_name),

            'permissions',
                to_jsonb(
                    v_permissions
                )
        )
    );


    return jsonb_build_object(
        'role_id',
            v_role_id,

        'name',
            trim(p_name),

        'permissions',
            to_jsonb(
                v_permissions
            )
    );

end;
$function$;


-- ============================================================
-- ATIVAR / DESATIVAR PERFIL
-- ============================================================

create or replace function public.set_access_role_active(
    p_organization_id uuid,
    p_role_id uuid,
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
    v_name text;

    v_is_owner boolean;

    v_is_system boolean;
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


    select
        r.name,
        r.is_owner,
        r.is_system

    into
        v_name,
        v_is_owner,
        v_is_system

    from public.roles r

    where
        r.id =
            p_role_id

        and r.organization_id =
            p_organization_id

    for update;


    if not found then
        raise exception
            'Role not found';
    end if;


    if v_is_owner = true then
        raise exception
            'Owner role cannot be disabled'
            using errcode = '42501';
    end if;


    if v_is_system = true then
        raise exception
            'System role cannot be disabled'
            using errcode = '42501';
    end if;


    update public.roles
    set
        is_active =
            p_active,

        updated_at =
            now()

    where
        id =
            p_role_id

        and organization_id =
            p_organization_id;


    perform app_private.write_audit(
        p_organization_id,
        null,

        case
            when p_active then
                'access_role.activated'
            else
                'access_role.deactivated'
        end,

        'roles',
        p_role_id,

        jsonb_build_object(
            'name',
                v_name,

            'active',
                p_active
        )
    );


    return jsonb_build_object(
        'role_id',
            p_role_id,

        'name',
            v_name,

        'active',
            p_active
    );

end;
$function$;


-- ============================================================
-- EXECUTE
-- ============================================================

revoke all
on function public.list_access_roles(
    uuid
)
from public;

grant execute
on function public.list_access_roles(
    uuid
)
to authenticated;


revoke all
on function public.save_access_role(
    uuid,
    uuid,
    text,
    text,
    text[]
)
from public;

grant execute
on function public.save_access_role(
    uuid,
    uuid,
    text,
    text,
    text[]
)
to authenticated;


revoke all
on function public.set_access_role_active(
    uuid,
    uuid,
    boolean
)
from public;

grant execute
on function public.set_access_role_active(
    uuid,
    uuid,
    boolean
)
to authenticated;


notify pgrst, 'reload schema';