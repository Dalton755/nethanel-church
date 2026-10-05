-- Nethanel Elo v46f
-- Aplica os recursos de personalização conforme o plano efetivo.

create or replace function public.get_my_branding_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
          'app_name', case
            when coalesce((sp.features ->> 'custom_app_name')::boolean, false)
              then coalesce(nullif(trim(o.app_name), ''), o.name)
            else o.name
          end,
          'logo_url', o.logo_url,
          'app_icon_url', case
            when coalesce((sp.features ->> 'custom_launcher_icon')::boolean, false)
              then o.app_icon_url
            else null
          end,
          'splash_url', case
            when coalesce((sp.features ->> 'custom_splash')::boolean, false)
              then o.splash_url
            else null
          end,
          'primary_color', case
            when coalesce((sp.features ->> 'custom_colors')::boolean, false)
              then o.primary_color
            else '#2387C9'
          end,
          'secondary_color', case
            when coalesce((sp.features ->> 'custom_colors')::boolean, false)
              then o.secondary_color
            else '#DCE9F3'
          end,
          'background_color', case
            when coalesce((sp.features ->> 'custom_colors')::boolean, false)
              then o.background_color
            else '#F6F8FB'
          end,
          'white_label_enabled', (
            o.white_label_enabled
            and coalesce((sp.features ->> 'standalone_apk')::boolean, false)
          ),
          'custom_domain', case
            when sp.features -> 'custom_domain' = 'true'::jsonb
              or sp.features ->> 'custom_domain' = 'optional'
              then o.custom_domain
            else null
          end
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
      join public.subscription_plans sp
        on sp.code = app_private.organization_effective_plan_code(o.id)
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
set search_path = ''
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
  v_features jsonb := '{}'::jsonb;
  v_custom_colors boolean := false;
  v_custom_app_name boolean := false;
  v_custom_icon boolean := false;
  v_custom_splash boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not app_private.has_permission(p_organization_id, 'organization.manage', null) then
    raise exception 'Somente o administrador pode personalizar a igreja'
      using errcode = '42501';
  end if;

  select coalesce(sp.features, '{}'::jsonb)
  into v_features
  from public.subscription_plans sp
  where sp.code = app_private.organization_effective_plan_code(p_organization_id);

  v_custom_colors := coalesce((v_features ->> 'custom_colors')::boolean, false);
  v_custom_app_name := coalesce((v_features ->> 'custom_app_name')::boolean, false);
  v_custom_icon := coalesce((v_features ->> 'custom_launcher_icon')::boolean, false);
  v_custom_splash := coalesce((v_features ->> 'custom_splash')::boolean, false);

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

  if not v_custom_colors and (
    v_primary <> '#2387C9'
    or v_secondary <> '#DCE9F3'
    or v_background <> '#F6F8FB'
  ) then
    raise exception 'Seu plano não inclui cores personalizadas.';
  end if;

  if not v_custom_app_name
     and v_app_name is not null
     and v_app_name <> v_name then
    raise exception 'Nome próprio do aplicativo está disponível no Elo White Label.';
  end if;

  if not v_custom_icon and v_app_icon_url is not null then
    raise exception 'Ícone próprio do aplicativo está disponível no Elo White Label.';
  end if;

  if not v_custom_splash and v_splash_url is not null then
    raise exception 'Imagem de abertura personalizada não está disponível no seu plano.';
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
      app_name = case
        when v_custom_app_name then coalesce(v_app_name, v_name)
        else v_name
      end,
      primary_color = case when v_custom_colors then v_primary else '#2387C9' end,
      secondary_color = case when v_custom_colors then v_secondary else '#DCE9F3' end,
      background_color = case when v_custom_colors then v_background else '#F6F8FB' end,
      logo_url = v_logo_url,
      app_icon_url = case when v_custom_icon then v_app_icon_url else app_icon_url end,
      splash_url = case when v_custom_splash then v_splash_url else splash_url end,
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
      'app_name', case when v_custom_app_name then coalesce(v_app_name, v_name) else v_name end,
      'primary_color', case when v_custom_colors then v_primary else '#2387C9' end,
      'secondary_color', case when v_custom_colors then v_secondary else '#DCE9F3' end,
      'background_color', case when v_custom_colors then v_background else '#F6F8FB' end,
      'has_logo', v_logo_url is not null,
      'has_app_icon', v_custom_icon and v_app_icon_url is not null,
      'has_splash', v_custom_splash and v_splash_url is not null,
      'effective_plan_code', app_private.organization_effective_plan_code(p_organization_id)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'name', v_name,
    'app_name', case when v_custom_app_name then coalesce(v_app_name, v_name) else v_name end,
    'primary_color', case when v_custom_colors then v_primary else '#2387C9' end,
    'secondary_color', case when v_custom_colors then v_secondary else '#DCE9F3' end,
    'background_color', case when v_custom_colors then v_background else '#F6F8FB' end,
    'logo_url', v_logo_url,
    'app_icon_url', case when v_custom_icon then v_app_icon_url else null end,
    'splash_url', case when v_custom_splash then v_splash_url else null end
  );
end;
$$;

revoke all on function public.save_organization_branding_v2(uuid,text,text,text,text,text,text,text,text)
from public, anon;
grant execute on function public.save_organization_branding_v2(uuid,text,text,text,text,text,text,text,text)
to authenticated;
