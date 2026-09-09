-- ============================================================
-- NETHANEL CHURCH
-- Contexto ativo do usuário
-- ============================================================
-- Retorna em uma única chamada:
-- - profile
-- - organizações acessíveis
-- - pessoa em cada organização
-- - unidades acessíveis
-- - papéis ativos
-- - permissões efetivas
--
-- A função é SECURITY DEFINER, mas sempre restringe os dados
-- ao auth.uid() atual.
-- ============================================================

create or replace function public.get_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
    v_user_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    return jsonb_build_object(

        -- ====================================================
        -- PROFILE GLOBAL
        -- ====================================================

        'profile',
        coalesce(
            (
                select jsonb_build_object(
                    'user_id', p.user_id,
                    'display_name', p.display_name,
                    'avatar_url', p.avatar_url,
                    'locale', p.locale,
                    'timezone', p.timezone
                )
                from public.profiles p
                where p.user_id = v_user_id
            ),
            'null'::jsonb
        ),

        -- ====================================================
        -- ORGANIZAÇÕES DISPONÍVEIS
        -- ====================================================

        'organizations',
        coalesce(
            (
                select jsonb_agg(
                    organization_data
                    order by organization_data ->> 'name'
                )
                from (
                    select jsonb_build_object(

                        'id', o.id,
                        'name', o.name,
                        'slug', o.slug,
                        'status', o.status,

                        -- ====================================
                        -- PESSOA NESTA ORGANIZAÇÃO
                        -- ====================================

                        'person',
                        jsonb_build_object(
                            'id', person.id,
                            'full_name', person.full_name,
                            'preferred_name', person.preferred_name,
                            'email', person.email,
                            'phone', person.phone
                        ),

                        -- ====================================
                        -- UNIDADES ACESSÍVEIS
                        -- ====================================

                        'units',
                        coalesce(
                            (
                                select jsonb_agg(
                                    jsonb_build_object(
                                        'id', u.id,
                                        'name', u.name,
                                        'slug', u.slug,
                                        'unit_type', u.unit_type,
                                        'is_headquarters', u.is_headquarters,
                                        'status', u.status,
                                        'timezone', u.timezone
                                    )
                                    order by
                                        u.is_headquarters desc,
                                        u.name
                                )
                                from public.units u
                                where
                                    u.organization_id = o.id
                                    and u.status = 'active'
                                    and (
                                        -- A pessoa possui vínculo
                                        -- direto com a unidade.
                                        exists (
                                            select 1
                                            from public.unit_memberships um
                                            where
                                                um.organization_id = o.id
                                                and um.unit_id = u.id
                                                and um.person_id = person.id
                                                and um.status = 'active'
                                        )

                                        or

                                        -- Ou possui papel válido
                                        -- nesta unidade / organização.
                                        exists (
                                            select 1
                                            from public.user_role_assignments ura
                                            join public.roles r
                                              on r.id = ura.role_id
                                             and r.organization_id =
                                                 ura.organization_id
                                            where
                                                ura.organization_id = o.id
                                                and ura.person_id = person.id
                                                and ura.is_active = true
                                                and r.is_active = true
                                                and ura.starts_at <= now()
                                                and (
                                                    ura.ends_at is null
                                                    or ura.ends_at >= now()
                                                )
                                                and (
                                                    ura.unit_id is null
                                                    or ura.unit_id = u.id
                                                )
                                        )
                                    )
                            ),
                            '[]'::jsonb
                        ),

                        -- ====================================
                        -- PAPÉIS ATIVOS
                        -- ====================================

                        'roles',
                        coalesce(
                            (
                                select jsonb_agg(
                                    jsonb_build_object(
                                        'assignment_id', ura.id,
                                        'role_id', r.id,
                                        'name', r.name,
                                        'role_key', r.role_key,
                                        'description', r.description,
                                        'is_owner', r.is_owner,
                                        'is_system', r.is_system,
                                        'unit_id', ura.unit_id
                                    )
                                    order by
                                        r.is_owner desc,
                                        r.name
                                )
                                from public.user_role_assignments ura
                                join public.roles r
                                  on r.id = ura.role_id
                                 and r.organization_id =
                                     ura.organization_id
                                where
                                    ura.organization_id = o.id
                                    and ura.person_id = person.id
                                    and ura.is_active = true
                                    and r.is_active = true
                                    and ura.starts_at <= now()
                                    and (
                                        ura.ends_at is null
                                        or ura.ends_at >= now()
                                    )
                            ),
                            '[]'::jsonb
                        ),

                        -- ====================================
                        -- PERMISSÕES EFETIVAS
                        -- ====================================

                        'permissions',
                        coalesce(
                            (
                                select jsonb_agg(
                                    permission_data.permission_key
                                    order by
                                        permission_data.permission_key
                                )
                                from (
                                    select distinct
                                        perm.permission_key
                                    from public.permissions perm
                                    where exists (
                                        select 1
                                        from public.user_role_assignments ura
                                        join public.roles r
                                          on r.id = ura.role_id
                                         and r.organization_id =
                                             ura.organization_id
                                        left join public.role_permissions rp
                                          on rp.role_id = r.id
                                        where
                                            ura.organization_id = o.id
                                            and ura.person_id = person.id
                                            and ura.is_active = true
                                            and r.is_active = true
                                            and ura.starts_at <= now()
                                            and (
                                                ura.ends_at is null
                                                or ura.ends_at >= now()
                                            )
                                            and (
                                                r.is_owner = true
                                                or rp.permission_key =
                                                   perm.permission_key
                                            )
                                    )
                                ) permission_data
                            ),
                            '[]'::jsonb
                        )

                    ) as organization_data

                    from public.organizations o

                    join public.people person
                      on person.organization_id = o.id
                     and person.auth_user_id = v_user_id
                     and person.record_status = 'active'

                    join public.organization_memberships om
                      on om.organization_id = o.id
                     and om.person_id = person.id
                     and om.status = 'active'

                    where o.status = 'active'

                ) organizations_query
            ),
            '[]'::jsonb
        )
    );
end;
$$;

-- ============================================================
-- SEGURANÇA
-- ============================================================

revoke all
on function public.get_my_context()
from public;

revoke all
on function public.get_my_context()
from anon;

grant execute
on function public.get_my_context()
to authenticated;

-- Solicita recarga do schema do PostgREST.
notify pgrst, 'reload schema';