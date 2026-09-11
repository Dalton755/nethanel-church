-- ============================================================
-- Nethanel Church
-- Fundação da Central de Gestão
-- ============================================================


-- ============================================================
-- 1. CLASSIFICAÇÃO DO ESCOPO DAS PERMISSÕES
-- ============================================================
--
-- organization:
-- só pode ser concedida globalmente para a organização.
--
-- unit:
-- pode ser concedida globalmente OU limitada a uma unidade.
-- ============================================================

update public.permissions
set permission_scope = 'unit'
where permission_key in (
    'people.view',
    'people.manage',
    'agenda.view',
    'agenda.manage',
    'services.view',
    'services.manage'
);

update public.permissions
set permission_scope = 'organization'
where permission_key in (
    'organization.manage',
    'units.manage',
    'security.manage',
    'audit.view'
);


-- ============================================================
-- 2. VERIFICAÇÃO DE PERMISSÃO COM ESCOPO
-- ============================================================

create or replace function app_private.has_permission(
    p_organization_id uuid,
    p_permission_key text,
    p_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path to
    'public',
    'auth',
    'pg_temp'
as $function$

    select
        app_private.is_org_member(
            p_organization_id
        )

        and exists (
            select 1

            from public.people p

            join public.user_role_assignments ura
              on ura.person_id = p.id
             and ura.organization_id =
                 p.organization_id

            join public.roles r
              on r.id = ura.role_id
             and r.organization_id =
                 ura.organization_id

            join public.permissions perm
              on perm.permission_key =
                 p_permission_key

            left join public.role_permissions rp
              on rp.role_id = r.id
             and rp.permission_key =
                 perm.permission_key

            where
                p.organization_id =
                    p_organization_id

                and p.auth_user_id =
                    auth.uid()

                and p.record_status =
                    'active'

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

                and (
                    r.is_owner = true
                    or rp.permission_key =
                       p_permission_key
                )

                and (

                    -- -----------------------------------------
                    -- Permissões da organização
                    -- -----------------------------------------
                    (
                        perm.permission_scope =
                            'organization'

                        and ura.unit_id
                            is null
                    )

                    or

                    -- -----------------------------------------
                    -- Permissões que aceitam escopo por unidade
                    -- -----------------------------------------
                    (
                        perm.permission_scope =
                            'unit'

                        and (

                            -- Consulta organizacional:
                            -- exige atribuição global.
                            (
                                p_unit_id
                                    is null

                                and ura.unit_id
                                    is null
                            )

                            or

                            -- Consulta para unidade:
                            -- aceita perfil global ou
                            -- perfil desta unidade.
                            (
                                p_unit_id
                                    is not null

                                and (
                                    ura.unit_id
                                        is null

                                    or ura.unit_id =
                                       p_unit_id
                                )
                            )
                        )
                    )
                )
        );

$function$;


-- ============================================================
-- 3. MATRIZ DE ACESSO DO USUÁRIO
-- ============================================================
--
-- Não substituímos get_my_context agora.
-- Esta RPC complementa o contexto atual e preserva escopos.
-- ============================================================

create or replace function public.get_my_access_matrix()
returns jsonb
language sql
stable
security definer
set search_path to
    'public',
    'auth',
    'pg_temp'
as $function$

with my_people as (
    select
        p.id as person_id,
        p.organization_id

    from public.people p

    join public.organization_memberships om
      on om.organization_id =
         p.organization_id
     and om.person_id =
         p.id

    where
        p.auth_user_id =
            auth.uid()

        and p.record_status =
            'active'

        and om.status =
            'active'
),

valid_assignments as (
    select
        mp.organization_id,
        mp.person_id,

        ura.id
            as assignment_id,

        ura.unit_id,

        r.id
            as role_id,

        r.is_owner

    from my_people mp

    join public.user_role_assignments ura
      on ura.organization_id =
         mp.organization_id
     and ura.person_id =
         mp.person_id

    join public.roles r
      on r.id =
         ura.role_id
     and r.organization_id =
         ura.organization_id

    where
        ura.is_active =
            true

        and ura.starts_at <=
            now()

        and (
            ura.ends_at
                is null

            or ura.ends_at >=
               now()
        )

        and r.is_active =
            true
),

effective_permissions as (
    select distinct
        va.organization_id,
        va.unit_id,
        perm.permission_key,
        perm.permission_scope

    from valid_assignments va

    cross join
        public.permissions perm

    left join
        public.role_permissions rp
      on rp.role_id =
         va.role_id
     and rp.permission_key =
         perm.permission_key

    where
        va.is_owner =
            true

        or rp.permission_key
           is not null
),

organization_access as (
    select
        mp.organization_id,

        coalesce(
            (
                select
                    jsonb_agg(
                        x.permission_key
                        order by
                            x.permission_key
                    )

                from (
                    select distinct
                        ep.permission_key

                    from effective_permissions ep

                    where
                        ep.organization_id =
                            mp.organization_id

                        and ep.unit_id
                            is null
                ) x
            ),
            '[]'::jsonb
        )
        as organization_permissions,

        coalesce(
            (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'unit_id',
                            u.id,

                            'permissions',
                            coalesce(
                                (
                                    select
                                        jsonb_agg(
                                            up.permission_key
                                            order by
                                                up.permission_key
                                        )

                                    from (
                                        select distinct
                                            ep.permission_key

                                        from effective_permissions ep

                                        where
                                            ep.organization_id =
                                                mp.organization_id

                                            and (
                                                -- Perfil global:
                                                -- vale nesta unidade.
                                                ep.unit_id
                                                    is null

                                                or

                                                -- Perfil limitado:
                                                -- só vale na unidade
                                                -- correspondente e
                                                -- somente para permissões
                                                -- unitárias.
                                                (
                                                    ep.unit_id =
                                                        u.id

                                                    and ep.permission_scope =
                                                        'unit'
                                                )
                                            )
                                    ) up
                                ),
                                '[]'::jsonb
                            )
                        )

                        order by
                            u.is_headquarters desc,
                            u.name
                    )

                from public.units u

                where
                    u.organization_id =
                        mp.organization_id

                    and u.status =
                        'active'
            ),
            '[]'::jsonb
        )
        as unit_permissions

    from my_people mp

    group by
        mp.organization_id
)

select
    jsonb_build_object(
        'organizations',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'organization_id',
                        oa.organization_id,

                    'organization_permissions',
                        oa.organization_permissions,

                    'units',
                        oa.unit_permissions
                )

                order by
                    oa.organization_id
            ),

            '[]'::jsonb
        )
    )

from organization_access oa;

$function$;


revoke all
on function public.get_my_access_matrix()
from public;

grant execute
on function public.get_my_access_matrix()
to authenticated;


-- ============================================================
-- 4. PROTEGER PAPEL PROPRIETÁRIO
-- ============================================================

create or replace function app_private.guard_owner_role()
returns trigger
language plpgsql
security definer
set search_path to
    'public',
    'auth',
    'pg_temp'
as $function$
begin

    if tg_op = 'DELETE'
       and old.is_owner = true then

        raise exception
            'Owner role cannot be deleted'
            using errcode = '42501';
    end if;


    if tg_op = 'UPDATE'
       and old.is_owner = true then

        if new.is_owner = false
           or new.is_active = false
           or lower(new.role_key) <> 'owner' then

            raise exception
                'Owner role cannot be disabled or converted'
                using errcode = '42501';
        end if;
    end if;


    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$function$;


drop trigger if exists
    roles_guard_owner
on public.roles;


create trigger
    roles_guard_owner
before update or delete
on public.roles
for each row
execute function
    app_private.guard_owner_role();


-- ============================================================
-- 5. PROTEGER ATRIBUIÇÕES DO PROPRIETÁRIO
-- ============================================================

create or replace function app_private.guard_owner_assignment()
returns trigger
language plpgsql
security definer
set search_path to
    'public',
    'auth',
    'pg_temp'
as $function$
declare
    v_old_is_owner boolean :=
        false;

    v_new_is_owner boolean :=
        false;

    v_removing_owner boolean :=
        false;
begin

    -- --------------------------------------------------------
    -- Descobrir se o papel antigo é Proprietário
    -- --------------------------------------------------------

    if tg_op in (
        'UPDATE',
        'DELETE'
    ) then

        select
            r.is_owner

        into
            v_old_is_owner

        from public.roles r

        where
            r.id =
                old.role_id

            and r.organization_id =
                old.organization_id;
    end if;


    -- --------------------------------------------------------
    -- Descobrir se o novo papel é Proprietário
    -- --------------------------------------------------------

    if tg_op in (
        'INSERT',
        'UPDATE'
    ) then

        select
            r.is_owner

        into
            v_new_is_owner

        from public.roles r

        where
            r.id =
                new.role_id

            and r.organization_id =
                new.organization_id;


        -- Proprietário é sempre global.
        if v_new_is_owner = true
           and new.unit_id is not null then

            raise exception
                'Owner role must have organization scope'
                using errcode = '42501';
        end if;
    end if;


    -- --------------------------------------------------------
    -- A operação está removendo uma atribuição ativa
    -- de Proprietário?
    -- --------------------------------------------------------

    if tg_op = 'DELETE'
       and v_old_is_owner = true
       and old.is_active = true
       and old.starts_at <= now()
       and (
            old.ends_at is null
            or old.ends_at >= now()
       ) then

        v_removing_owner :=
            true;
    end if;


    if tg_op = 'UPDATE'
       and v_old_is_owner = true
       and old.is_active = true
       and old.starts_at <= now()
       and (
            old.ends_at is null
            or old.ends_at >= now()
       )
       and (
            v_new_is_owner = false
            or new.is_active = false
            or new.starts_at > now()
            or (
                new.ends_at is not null
                and new.ends_at < now()
            )
       ) then

        v_removing_owner :=
            true;
    end if;


    -- --------------------------------------------------------
    -- Nunca permitir retirar o último Proprietário ativo.
    -- --------------------------------------------------------

    if v_removing_owner then

        if not exists (
            select 1

            from public.user_role_assignments ura

            join public.roles r
              on r.id =
                 ura.role_id
             and r.organization_id =
                 ura.organization_id

            where
                ura.organization_id =
                    old.organization_id

                and ura.id <>
                    old.id

                and ura.is_active =
                    true

                and ura.starts_at <=
                    now()

                and (
                    ura.ends_at
                        is null

                    or ura.ends_at >=
                       now()
                )

                and r.is_owner =
                    true

                and r.is_active =
                    true
        ) then

            raise exception
                'The organization must keep at least one active owner'
                using errcode = '42501';
        end if;
    end if;


    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$function$;


drop trigger if exists
    user_role_assignments_guard_owner
on public.user_role_assignments;


create trigger
    user_role_assignments_guard_owner
before insert or update or delete
on public.user_role_assignments
for each row
execute function
    app_private.guard_owner_assignment();


notify pgrst, 'reload schema';