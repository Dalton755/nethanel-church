create or replace function public.join_organization_by_code(p_code text)
returns table(
  organization_id uuid,
  person_id uuid,
  role_key text,
  name text
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'app_private', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_org_name text;
  v_person_id uuid;
  v_unit_id uuid;
  v_member_role_id uuid;
  v_email text;
  v_full_name text;
  v_matches uuid[];
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select o.id, o.name
    into v_org_id, v_org_name
  from public.organizations o
  where o.status='active'
    and upper(o.join_code)=upper(trim(p_code))
  limit 1;

  if v_org_id is null then
    raise exception 'Código de igreja não encontrado';
  end if;

  select lower(u.email),
         coalesce(
           nullif(trim(p.display_name),''),
           nullif(trim(u.raw_user_meta_data->>'full_name'),''),
           nullif(trim(u.raw_user_meta_data->>'name'),''),
           split_part(u.email,'@',1),
           'Membro'
         )
    into v_email, v_full_name
  from auth.users u
  left join public.profiles p on p.user_id=u.id
  where u.id=v_user_id;

  select p.id
    into v_person_id
  from public.people p
  where p.organization_id=v_org_id
    and p.auth_user_id=v_user_id
    and p.record_status='active'
  limit 1;

  if v_person_id is null and v_email is not null then
    select array_agg(p.id order by p.created_at)
      into v_matches
    from public.people p
    where p.organization_id=v_org_id
      and p.auth_user_id is null
      and p.record_status='active'
      and p.email is not null
      and lower(trim(p.email))=v_email;

    v_count := coalesce(array_length(v_matches,1),0);

    if v_count = 1 then
      v_person_id := v_matches[1];

      update public.people as pp
      set auth_user_id=v_user_id,
          updated_at=now()
      where pp.id=v_person_id
        and pp.organization_id=v_org_id
        and pp.auth_user_id is null;
    elsif v_count > 1 then
      raise exception 'Há mais de um cadastro com este e-mail. A secretaria precisa confirmar o vínculo.';
    end if;
  end if;

  if v_person_id is null then
    insert into public.people(
      organization_id, auth_user_id, full_name, email, created_by
    )
    values(
      v_org_id, v_user_id, v_full_name, v_email, v_user_id
    )
    returning id into v_person_id;
  end if;

  insert into public.organization_memberships(
    organization_id, person_id, membership_type, status, started_at, ended_at
  )
  values(
    v_org_id, v_person_id, 'member', 'active', current_date, null
  )
  on conflict on constraint organization_memberships_one_per_person_uq
  do update
  set status='active',
      ended_at=null,
      updated_at=now();

  select u.id
    into v_unit_id
  from public.units u
  where u.organization_id=v_org_id
    and u.status='active'
  order by u.is_headquarters desc, u.created_at
  limit 1;

  if v_unit_id is not null then
    update public.unit_memberships as um
    set status='active',
        ended_at=null,
        updated_at=now()
    where um.organization_id=v_org_id
      and um.unit_id=v_unit_id
      and um.person_id=v_person_id
      and um.relationship_type='member';

    if not found then
      insert into public.unit_memberships(
        organization_id, unit_id, person_id, relationship_type, status, started_at
      )
      values(
        v_org_id, v_unit_id, v_person_id, 'member', 'active', current_date
      );
    end if;
  end if;

  perform app_private.ensure_elo_system_roles(v_org_id);

  if not exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r
      on r.id=ura.role_id
     and r.organization_id=ura.organization_id
    where ura.organization_id=v_org_id
      and ura.person_id=v_person_id
      and ura.is_active=true
      and r.is_active=true
      and ura.starts_at <= now()
      and (ura.ends_at is null or ura.ends_at >= now())
  ) then
    select r.id
      into v_member_role_id
    from public.roles r
    where r.organization_id=v_org_id
      and lower(r.role_key)='membro'
      and r.is_active=true
    limit 1;

    insert into public.user_role_assignments(
      organization_id, person_id, role_id, unit_id, created_by
    )
    values(
      v_org_id, v_person_id, v_member_role_id, null, v_user_id
    );
  end if;

  perform app_private.write_audit(
    v_org_id,
    v_unit_id,
    'organization.joined',
    'people',
    v_person_id,
    jsonb_build_object('join_method','code')
  );

  return query
  select
    v_org_id,
    v_person_id,
    coalesce((
      select r.role_key
      from public.user_role_assignments ura
      join public.roles r
        on r.id=ura.role_id
       and r.organization_id=ura.organization_id
      where ura.organization_id=v_org_id
        and ura.person_id=v_person_id
        and ura.is_active=true
        and r.is_active=true
      order by r.is_owner desc,
               case lower(r.role_key)
                 when 'admin' then 1
                 when 'pastor' then 2
                 when 'secretario' then 3
                 when 'tesoureiro' then 4
                 when 'lider' then 5
                 when 'voluntario' then 6
                 when 'membro' then 7
                 else 8
               end
      limit 1
    ), 'membro'),
    v_org_name;
end;
$function$;
