-- Elo church personalization v38

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'church-branding','church-branding',true,5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists church_branding_insert_admin on storage.objects;
create policy church_branding_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id='church-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then app_private.has_permission(
      ((storage.foldername(name))[1])::uuid,
      'organization.manage',
      null
    )
    else false
  end
);

drop policy if exists church_branding_update_admin on storage.objects;
create policy church_branding_update_admin
on storage.objects
for update
to authenticated
using (
  bucket_id='church-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then app_private.has_permission(
      ((storage.foldername(name))[1])::uuid,
      'organization.manage',
      null
    )
    else false
  end
)
with check (bucket_id='church-branding');

drop policy if exists church_branding_delete_admin on storage.objects;
create policy church_branding_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id='church-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then app_private.has_permission(
      ((storage.foldername(name))[1])::uuid,
      'organization.manage',
      null
    )
    else false
  end
);

CREATE OR REPLACE FUNCTION public.save_organization_branding(p_organization_id uuid, p_name text, p_primary_color text, p_logo_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_name text:=trim(coalesce(p_name,''));
  v_color text:=upper(trim(coalesce(p_primary_color,'')));
  v_logo_url text:=nullif(trim(coalesce(p_logo_url,'')),'');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(
    p_organization_id,
    'organization.manage',
    null
  ) then
    raise exception 'Somente o administrador pode personalizar a igreja'
      using errcode='42501';
  end if;

  if length(v_name)<2 or length(v_name)>120 then
    raise exception 'Informe um nome de igreja válido';
  end if;

  if v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Cor principal inválida';
  end if;

  if v_logo_url is not null
     and position(
       '/storage/v1/object/public/church-branding/'||
       p_organization_id::text||'/'
       in v_logo_url
     )=0
  then
    raise exception 'Logo inválida';
  end if;

  update public.organizations
  set name=v_name,
      primary_color=v_color,
      logo_url=v_logo_url,
      updated_at=now()
  where id=p_organization_id
    and status='active';

  if not found then
    raise exception 'Igreja não encontrada';
  end if;

  perform app_private.write_audit(
    p_organization_id,
    null,
    'organization.branding_updated',
    'organizations',
    p_organization_id,
    jsonb_build_object(
      'name',v_name,
      'primary_color',v_color,
      'has_logo',v_logo_url is not null
    )
  );

  return jsonb_build_object(
    'ok',true,
    'organization_id',p_organization_id,
    'name',v_name,
    'primary_color',v_color,
    'logo_url',v_logo_url
  );
end;
$function$
;

revoke all on function public.save_organization_branding(uuid,text,text,text)
from public,anon;
grant execute on function public.save_organization_branding(uuid,text,text,text)
to authenticated;

CREATE OR REPLACE FUNCTION public.get_my_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
                        'logo_url', o.logo_url,
                        'primary_color', o.primary_color,

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
$function$
;

notify pgrst,'reload schema';
