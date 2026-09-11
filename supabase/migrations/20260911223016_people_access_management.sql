-- ============================================================
-- Nethanel Church
-- Gestão de Pessoas e Acessos
-- ============================================================


-- ============================================================
-- LISTAR PESSOAS E ACESSOS
-- ============================================================

create or replace function public.list_people_access(
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

        'people',

        coalesce(
            (
                select jsonb_agg(
                    person_data
                    order by
                        lower(
                            person_data ->> 'full_name'
                        )
                )

                from (
                    select jsonb_build_object(

                        'id',
                            p.id,

                        'full_name',
                            p.full_name,

                        'preferred_name',
                            p.preferred_name,

                        'email',
                            p.email,

                        'phone',
                            p.phone,

                        'record_status',
                            p.record_status,

                        'auth_user_id',
                            p.auth_user_id,

                        'has_login',
                            (
                                p.auth_user_id
                                is not null
                            ),

                        'membership_type',
                            om.membership_type,

                        'membership_status',
                            om.status,

                        'assignments',

                        coalesce(
                            (
                                select jsonb_agg(
                                    jsonb_build_object(

                                        'assignment_id',
                                            ura.id,

                                        'role_id',
                                            r.id,

                                        'role_name',
                                            r.name,

                                        'role_key',
                                            r.role_key,

                                        'is_owner',
                                            r.is_owner,

                                        'is_system',
                                            r.is_system,

                                        'unit_id',
                                            ura.unit_id,

                                        'unit_name',
                                            u.name,

                                        'starts_at',
                                            ura.starts_at,

                                        'ends_at',
                                            ura.ends_at

                                    )

                                    order by
                                        r.is_owner desc,
                                        r.name,
                                        u.name
                                )

                                from public.user_role_assignments ura

                                join public.roles r
                                  on r.id =
                                     ura.role_id
                                 and r.organization_id =
                                     ura.organization_id

                                left join public.units u
                                  on u.id =
                                     ura.unit_id
                                 and u.organization_id =
                                     ura.organization_id

                                where
                                    ura.organization_id =
                                        p.organization_id

                                    and ura.person_id =
                                        p.id

                                    and ura.is_active =
                                        true

                                    and ura.starts_at <=
                                        now()

                                    and (
                                        ura.ends_at is null
                                        or ura.ends_at >=
                                           now()
                                    )

                                    and r.is_active =
                                        true
                            ),

                            '[]'::jsonb
                        )

                    ) as person_data

                    from public.people p

                    left join public.organization_memberships om
                      on om.organization_id =
                         p.organization_id
                     and om.person_id =
                         p.id

                    where
                        p.organization_id =
                            p_organization_id

                        and p.record_status <>
                            'archived'

                ) people_query
            ),

            '[]'::jsonb
        )
    );

end;
$function$;


-- ============================================================
-- CONCEDER PERFIL DE ACESSO
-- ============================================================

create or replace function public.grant_person_access(
    p_organization_id uuid,
    p_person_id uuid,
    p_role_id uuid,
    p_unit_id uuid default null
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
    v_role_name text;

    v_is_owner boolean;


    v_assignment_id uuid;

    v_unit_name text;
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


    -- --------------------------------------------------------
    -- Validar pessoa
    -- --------------------------------------------------------

    if not exists (
        select 1

        from public.people p

        where
            p.id =
                p_person_id

            and p.organization_id =
                p_organization_id

            and p.record_status =
                'active'
    ) then

        raise exception
            'Person not found or inactive';
    end if;


    -- --------------------------------------------------------
    -- Validar perfil
    -- --------------------------------------------------------

    select
    r.name,
    r.is_owner

into
    v_role_name,
    v_is_owner

    from public.roles r

    where
        r.id =
            p_role_id

        and r.organization_id =
            p_organization_id

        and r.is_active =
            true;


    if not found then
        raise exception
            'Role not found or inactive';
    end if;


    -- Proprietário não é concedido pela tela comum.
    -- Transferência/proprietário terá fluxo próprio.
    if v_is_owner = true then
        raise exception
            'Owner access requires the ownership management flow'
            using errcode = '42501';
    end if;


    -- --------------------------------------------------------
    -- Validar unidade
    -- --------------------------------------------------------

    if p_unit_id is not null then

        select
            u.name

        into
            v_unit_name

        from public.units u

        where
            u.id =
                p_unit_id

            and u.organization_id =
                p_organization_id

            and u.status =
                'active';


        if not found then
            raise exception
                'Unit not found or inactive';
        end if;


        /*
         * Um perfil limitado à unidade não pode carregar
         * permissões administrativas da organização.
         *
         * Isso evita que o administrador pense que
         * "Gerenciar configurações da igreja" vale
         * somente para uma congregação.
         */
        if exists (
            select 1

            from public.role_permissions rp

            join public.permissions perm
              on perm.permission_key =
                 rp.permission_key

            where
                rp.role_id =
                    p_role_id

                and perm.permission_scope =
                    'organization'
        ) then

            raise exception
                'This role requires organization scope';
        end if;

    end if;


    -- --------------------------------------------------------
    -- Se a mesma atribuição já está ativa, apenas retorná-la.
    -- --------------------------------------------------------

    select
        ura.id

    into
        v_assignment_id

    from public.user_role_assignments ura

    where
        ura.organization_id =
            p_organization_id

        and ura.person_id =
            p_person_id

        and ura.role_id =
            p_role_id

        and coalesce(
            ura.unit_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        ) =
        coalesce(
            p_unit_id,
            '00000000-0000-0000-0000-000000000000'::uuid
        )

        and ura.is_active =
            true

        and ura.starts_at <=
            now()

        and (
            ura.ends_at is null
            or ura.ends_at >=
               now()
        )

    limit 1;


    if v_assignment_id is not null then

        return jsonb_build_object(
            'assignment_id',
                v_assignment_id,

            'role_id',
                p_role_id,

            'role_name',
                v_role_name,

            'unit_id',
                p_unit_id,

            'unit_name',
                v_unit_name,

            'already_active',
                true
        );

    end if;


    -- --------------------------------------------------------
    -- Criar atribuição
    -- --------------------------------------------------------

    insert into public.user_role_assignments (
        organization_id,
        person_id,
        role_id,
        unit_id,
        is_active,
        starts_at,
        created_by
    )
    values (
        p_organization_id,
        p_person_id,
        p_role_id,
        p_unit_id,
        true,
        now(),
        auth.uid()
    )
    returning id
    into v_assignment_id;


    perform app_private.write_audit(
        p_organization_id,
        p_unit_id,
        'person_access.granted',
        'user_role_assignments',
        v_assignment_id,

        jsonb_build_object(
            'person_id',
                p_person_id,

            'role_id',
                p_role_id,

            'role_name',
                v_role_name,

            'unit_id',
                p_unit_id,

            'unit_name',
                v_unit_name
        )
    );


    return jsonb_build_object(
        'assignment_id',
            v_assignment_id,

        'role_id',
            p_role_id,

        'role_name',
            v_role_name,

        'unit_id',
            p_unit_id,

        'unit_name',
            v_unit_name,

        'already_active',
            false
    );

end;
$function$;


-- ============================================================
-- REVOGAR PERFIL DE ACESSO
-- ============================================================

create or replace function public.revoke_person_access(
    p_organization_id uuid,
    p_assignment_id uuid
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
    v_person_id uuid;

    v_role_id uuid;

    v_role_name text;

    v_unit_id uuid;

    v_is_owner boolean;
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
        ura.person_id,
        ura.role_id,
        r.name,
        ura.unit_id,
        r.is_owner

    into
        v_person_id,
        v_role_id,
        v_role_name,
        v_unit_id,
        v_is_owner

    from public.user_role_assignments ura

    join public.roles r
      on r.id =
         ura.role_id
     and r.organization_id =
         ura.organization_id

    where
        ura.id =
            p_assignment_id

        and ura.organization_id =
            p_organization_id

        and ura.is_active =
            true

    for update of ura;


    if not found then
        raise exception
            'Access assignment not found';
    end if;


    /*
     * Proprietário nunca é removido pela área comum
     * de Pessoas e acessos.
     */
    if v_is_owner = true then
        raise exception
            'Owner access cannot be revoked here'
            using errcode = '42501';
    end if;


    update public.user_role_assignments
    set
        is_active =
            false,

        ends_at =
            now(),

        updated_at =
            now()

    where
        id =
            p_assignment_id

        and organization_id =
            p_organization_id;


    perform app_private.write_audit(
        p_organization_id,
        v_unit_id,
        'person_access.revoked',
        'user_role_assignments',
        p_assignment_id,

        jsonb_build_object(
            'person_id',
                v_person_id,

            'role_id',
                v_role_id,

            'role_name',
                v_role_name,

            'unit_id',
                v_unit_id
        )
    );


    return jsonb_build_object(
        'assignment_id',
            p_assignment_id,

        'revoked',
            true
    );

end;
$function$;


-- ============================================================
-- PERMISSÕES DE EXECUÇÃO
-- ============================================================

revoke all
on function public.list_people_access(
    uuid
)
from public;

grant execute
on function public.list_people_access(
    uuid
)
to authenticated;


revoke all
on function public.grant_person_access(
    uuid,
    uuid,
    uuid,
    uuid
)
from public;

grant execute
on function public.grant_person_access(
    uuid,
    uuid,
    uuid,
    uuid
)
to authenticated;


revoke all
on function public.revoke_person_access(
    uuid,
    uuid
)
from public;

grant execute
on function public.revoke_person_access(
    uuid,
    uuid
)
to authenticated;


notify pgrst, 'reload schema';