-- Elo full church branding v45

alter table public.organizations
  add column if not exists app_name text,
  add column if not exists secondary_color text not null default '#DCE9F3',
  add column if not exists background_color text not null default '#F6F8FB',
  add column if not exists app_icon_url text,
  add column if not exists splash_url text,
  add column if not exists white_label_enabled boolean not null default false,
  add column if not exists custom_domain text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_secondary_color_format'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_secondary_color_format
      check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_background_color_format'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_background_color_format
      check (background_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$$;

create or replace function public.get_my_branding_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'organizations',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'organization_id', o.id,
          'app_name', coalesce(nullif(trim(o.app_name), ''), o.name),
          'logo_url', o.logo_url,
          'app_icon_url', o.app_icon_url,
          'splash_url', o.splash_url,
          'primary_color', o.primary_color,
          'secondary_color', o.secondary_color,
          'background_color', o.background_color,
          'white_label_enabled', o.white_label_enabled,
          'custom_domain', o.custom_domain
        ) order by o.name
      )
      from public.organizations o
      join public.people p
        on p.organization_id = o.id
       and p.auth_user_id = v_user_id
       and p.record_status = 'active'
      join public.organization_memberships om
        on om.organization_id = o.id
       and om.person_id = p.id
       and om.status = 'active'
      where o.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_branding_context() from public, anon;
grant execute on function public.get_my_branding_context() to authenticated;

create or replace function public.save_organization_branding_v2(
  p_organization_id uuid,
  p_name text,
  p_primary_color text,
  p_secondary_color text,
  p_background_color text,
  p_logo_url text default null,
  p_app_name text default null,
  p_app_icon_url text default null,
  p_splash_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private, pg_temp
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_app_name text := nullif(trim(coalesce(p_app_name, '')), '');
  v_primary text := upper(trim(coalesce(p_primary_color, '')));
  v_secondary text := upper(trim(coalesce(p_secondary_color, '')));
  v_background text := upper(trim(coalesce(p_background_color, '')));
  v_logo_url text := nullif(trim(coalesce(p_logo_url, '')), '');
  v_app_icon_url text := nullif(trim(coalesce(p_app_icon_url, '')), '');
  v_splash_url text := nullif(trim(coalesce(p_splash_url, '')), '');
  v_prefix text := '/storage/v1/object/public/church-branding/' || p_organization_id::text || '/';
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not app_private.has_permission(p_organization_id, 'organization.manage', null) then
    raise exception 'Somente o administrador pode personalizar a igreja'
      using errcode = '42501';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Informe um nome de igreja válido';
  end if;

  if v_app_name is not null and (length(v_app_name) < 2 or length(v_app_name) > 40) then
    raise exception 'O nome do aplicativo deve ter entre 2 e 40 caracteres';
  end if;

  if v_primary !~ '^#[0-9A-F]{6}$'
     or v_secondary !~ '^#[0-9A-F]{6}$'
     or v_background !~ '^#[0-9A-F]{6}$' then
    raise exception 'Uma ou mais cores são inválidas';
  end if;

  if v_logo_url is not null and position(v_prefix in v_logo_url) = 0 then
    raise exception 'Logo inválida';
  end if;

  if v_app_icon_url is not null and position(v_prefix in v_app_icon_url) = 0 then
    raise exception 'Ícone do aplicativo inválido';
  end if;

  if v_splash_url is not null and position(v_prefix in v_splash_url) = 0 then
    raise exception 'Imagem de abertura inválida';
  end if;

  update public.organizations
  set name = v_name,
      app_name = coalesce(v_app_name, v_name),
      primary_color = v_primary,
      secondary_color = v_secondary,
      background_color = v_background,
      logo_url = v_logo_url,
      app_icon_url = v_app_icon_url,
      splash_url = v_splash_url,
      updated_at = now()
  where id = p_organization_id
    and status = 'active';

  if not found then
    raise exception 'Igreja não encontrada';
  end if;

  perform app_private.write_audit(
    p_organization_id,
    null,
    'organization.branding_updated_v2',
    'organizations',
    p_organization_id,
    jsonb_build_object(
      'name', v_name,
      'app_name', coalesce(v_app_name, v_name),
      'primary_color', v_primary,
      'secondary_color', v_secondary,
      'background_color', v_background,
      'has_logo', v_logo_url is not null,
      'has_app_icon', v_app_icon_url is not null,
      'has_splash', v_splash_url is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'name', v_name,
    'app_name', coalesce(v_app_name, v_name),
    'primary_color', v_primary,
    'secondary_color', v_secondary,
    'background_color', v_background,
    'logo_url', v_logo_url,
    'app_icon_url', v_app_icon_url,
    'splash_url', v_splash_url
  );
end;
$$;

revoke all on function public.save_organization_branding_v2(uuid,text,text,text,text,text,text,text,text)
from public, anon;
grant execute on function public.save_organization_branding_v2(uuid,text,text,text,text,text,text,text,text)
to authenticated;

notify pgrst, 'reload schema';
