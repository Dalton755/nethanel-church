-- Nethanel Elo • Central de Atualizacoes, v58 (fase de previa).
-- Nenhum publish, deploy ou solicitacao de build e realizado por esta migration.
-- Observacao: versoes detectadas no telefone sao declaradas pelo cliente autenticado.

create table if not exists public.church_app_install_receipts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  android_package text not null,
  version_code integer not null check (version_code between 1 and 2100000000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists church_app_install_receipts_version_idx
  on public.church_app_install_receipts(organization_id, version_code, last_seen_at desc);
alter table public.church_app_install_receipts enable row level security;
revoke all on public.church_app_install_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.church_app_install_receipts to service_role;

create or replace function public.report_church_app_version(
  p_organization_id uuid,
  p_android_package text,
  p_version_code integer
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, app_private
as $$
declare v_expected text;
begin
  if (select auth.uid()) is null or not app_private.is_org_member(p_organization_id)
  then raise exception 'Acesso nao autorizado.' using errcode='42501'; end if;
  v_expected := 'br.com.nethanel.elo.c' || replace(p_organization_id::text,'-','');
  if p_android_package is distinct from v_expected
     or p_version_code not between 1 and 2100000000
  then raise exception 'Pacote ou versao Android invalida.' using errcode='22023'; end if;

  insert into public.church_app_install_receipts
    (organization_id, user_id, android_package, version_code)
  values (p_organization_id, (select auth.uid()), p_android_package, p_version_code)
  on conflict (organization_id,user_id)
  do update set android_package=excluded.android_package,
                version_code=excluded.version_code,
                last_seen_at=now();
  return true;
end;
$$;
revoke all on function public.report_church_app_version(uuid,text,integer) from public, anon;
grant execute on function public.report_church_app_version(uuid,text,integer) to authenticated;

create or replace function public.platform_admin_app_updates_dashboard()
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, app_private
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.is_platform_admin()
  then raise exception 'Acesso restrito a plataforma.' using errcode='42501'; end if;

  select jsonb_build_object(
    'releases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'channel',r.channel,'version_name',r.version_name,
        'version_code',r.version_code,'minimum_supported_version_code',
          r.minimum_supported_version_code,
        'release_notes',r.release_notes,'update_kind',r.update_kind,
        'status',r.status,'created_at',r.created_at,'published_at',r.published_at,
        'queued', (select count(*)::integer from public.church_apk_builds b
                   where b.release_id=r.id and b.status='queued'),
        'building', (select count(*)::integer from public.church_apk_builds b
                   where b.release_id=r.id and b.status='building'),
        'ready', (select count(*)::integer from public.church_apk_builds b
                   where b.release_id=r.id and b.status='ready'),
        'failed', (select count(*)::integer from public.church_apk_builds b
                   where b.release_id=r.id and b.status='failed')
      ) order by r.version_code desc)
      from public.church_app_releases r
    ),'[]'::jsonb),
    'churches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'name',o.name,'status',o.status,
        'apk_status', lb.status,
        'apk_version_code', lb.version_code,
        'apk_version_name', lb.version_name,
        'apk_release_id', lb.release_id,
        'apk_build_at', lb.created_at,
        'has_apk', lb.artifact_path is not null,
        'is_blessed', exists(select 1 from public.platform_church_blessings bl
          where bl.organization_id=o.id and bl.active),
        'reports_count', (select count(*)::integer from public.church_app_install_receipts i
                         where i.organization_id=o.id),
        'reported_latest_version_code', (
          select max(i.version_code) from public.church_app_install_receipts i
          where i.organization_id=o.id),
        'reported_version_counts', coalesce((
          select jsonb_agg(jsonb_build_object('version_code',z.version_code,'accounts',z.accounts)
                           order by z.version_code desc)
          from (select i.version_code,count(*)::integer as accounts
                from public.church_app_install_receipts i
                where i.organization_id=o.id
                group by i.version_code) z
        ),'[]'::jsonb)
      ) order by o.name)
      from public.organizations o
      left join lateral (
        select b.status,b.version_code,b.version_name,b.release_id,b.created_at,b.artifact_path
        from public.church_apk_builds b
        where b.organization_id=o.id
        order by b.created_at desc limit 1
      ) lb on true
    ),'[]'::jsonb),
    'summary', jsonb_build_object(
      'churches_with_apk', (select count(distinct organization_id)::integer
                             from public.church_apk_builds where status='ready'),
      'queued_builds', (select count(*)::integer
                        from public.church_apk_builds where status='queued'),
      'building_builds', (select count(*)::integer
                        from public.church_apk_builds where status='building'),
      'accounts_reporting', (select count(*)::integer from public.church_app_install_receipts),
      'next_version_code', greatest(
        coalesce((select max(version_code) from public.church_app_releases),0),
        coalesce((select max(version_code) from public.church_apk_builds),0)
      ) + 1
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.platform_admin_app_updates_dashboard() from public, anon;
grant execute on function public.platform_admin_app_updates_dashboard() to authenticated;

create or replace function public.platform_admin_create_app_release_draft(
  p_channel text,
  p_version_name text,
  p_version_code integer,
  p_release_notes text default '',
  p_minimum_supported_version_code integer default 1
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, app_private
as $$
declare v_id uuid; v_max integer;
begin
  if (select auth.uid()) is null or not public.is_platform_admin()
  then raise exception 'Acesso restrito a plataforma.' using errcode='42501'; end if;
  if p_channel not in ('preview','production')
     or p_version_name !~ '^[0-9]+[.][0-9]+[.][0-9]+$'
     or length(coalesce(p_release_notes,'')) > 1500
     or p_version_code not between 1 and 2100000000
     or p_minimum_supported_version_code not between 1 and p_version_code
  then raise exception 'Dados do release invalidos.' using errcode='22023'; end if;
  -- Bloqueia criacoes concorrentes do mesmo proximo numero (inclusive outro canal).
  perform pg_advisory_xact_lock(654938,42);
  select greatest(
    coalesce((select max(version_code) from public.church_app_releases),0),
    coalesce((select max(version_code) from public.church_apk_builds),0)
  ) into v_max;
  if p_version_code<=v_max then
     raise exception 'Use versionCode superior a % para evitar downgrade.',v_max
     using errcode='22023';
  end if;
  insert into public.church_app_releases(
    channel,version_name,version_code,minimum_supported_version_code,
    update_kind,runtime_version,release_notes,status)
  values(p_channel,p_version_name,p_version_code,p_minimum_supported_version_code,
    'apk', 'apk-catalog-'||p_version_name, coalesce(p_release_notes,''),'draft')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.platform_admin_create_app_release_draft(text,text,integer,text,integer)
 from public, anon;
grant execute on function public.platform_admin_create_app_release_draft(text,text,integer,text,integer)
 to authenticated;

create or replace function public.platform_admin_set_app_release_status(
  p_release_id uuid,
  p_status text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, app_private
as $$
declare v_release public.church_app_releases%rowtype;
begin
  if (select auth.uid()) is null or not public.is_platform_admin()
  then raise exception 'Acesso restrito a plataforma.' using errcode='42501'; end if;
  if p_status not in ('testing','paused','rolled_back')
  then raise exception 'Publicacao em producao depende de aprovacao explicita.' using errcode='42501'; end if;
  select * into v_release from public.church_app_releases
  where id=p_release_id for update;
  if not found then raise exception 'Release nao encontrado.'; end if;
  if p_status='testing' and not (v_release.channel='preview'
       and v_release.status in ('draft','paused'))
  then raise exception 'Apenas preview pode ser habilitada para testes.' using errcode='42501'; end if;
  if p_status='paused' and v_release.status not in ('testing','published')
  then raise exception 'Somente release ativo pode ser pausado.' using errcode='22023'; end if;
  if p_status='rolled_back' and v_release.status <> 'paused'
  then raise exception 'Pause o release antes de marca-lo como retirado.' using errcode='22023'; end if;
  update public.church_app_releases set status=p_status where id=p_release_id;
  return jsonb_build_object('id',p_release_id,'status',p_status);
end;
$$;
revoke all on function public.platform_admin_set_app_release_status(uuid,text)
 from public, anon;
grant execute on function public.platform_admin_set_app_release_status(uuid,text)
 to authenticated;

-- Protecao extra: nenhum administrador de igreja pode acionar a fabrica
-- para um release nao publicado ou de preview.
create or replace function public.request_church_app_update(
  p_organization_id uuid, p_release_id uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_release public.church_app_releases%rowtype;
  v_prev public.church_apk_builds%rowtype;
  v_existing public.church_apk_builds%rowtype;
  v_brand public.organizations%rowtype;
  v_snapshot jsonb;
  v_build public.church_apk_builds%rowtype;
  v_plan jsonb;
begin
  if (select auth.uid()) is null or not
    app_private.has_permission(p_organization_id,'organization.manage',null) then
      raise exception 'Somente administradores podem solicitar a atualizacao.'
        using errcode='42501';
  end if;

  v_plan := public.get_organization_plan_context(p_organization_id);
  if coalesce((v_plan->'features'->>'standalone_apk')::boolean,false)
       is distinct from true then
    raise exception 'Seu plano nao permite APK exclusivo.' using errcode='42501';
  end if;

  select * into v_release from public.church_app_releases
  where id=p_release_id and update_kind='apk'
    and channel='production' and status='published';
  if not found then raise exception 'Release nao publicado para esta igreja.' using errcode='42501'; end if;

  select * into v_prev from public.church_apk_builds
  where organization_id=p_organization_id and status='ready'
    and artifact_path is not null
  order by finished_at desc limit 1;
  if not found then
    raise exception 'Instale primeiro o APK inicial da sua igreja.';
  end if;

  select * into v_existing from public.church_apk_builds
  where organization_id=p_organization_id and release_id=p_release_id
    and status in ('queued','building','ready')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('id',v_existing.id,'status',v_existing.status,'existing',true);
  end if;

  select * into v_existing from public.church_apk_builds
  where organization_id=p_organization_id and status in ('queued','building')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('id',v_existing.id,'status',v_existing.status,'existing',true);
  end if;

  if exists (
    select 1 from public.church_apk_builds b
    where b.organization_id=p_organization_id and b.status='ready'
      and b.version_code is not null and b.version_code>=v_release.version_code
  ) then raise exception 'Este release nao e mais recente que o APK da igreja.'; end if;

  select * into v_brand from public.organizations
  where id=p_organization_id and status='active';
  if not found then raise exception 'Igreja indisponivel.'; end if;

  v_snapshot := v_prev.snapshot || jsonb_build_object(
    'app_name',coalesce(nullif(trim(v_brand.app_name),''),v_brand.name),
    'church_name',v_brand.name,
    'logo_url',coalesce(v_brand.logo_url,v_prev.snapshot->>'logo_url'),
    'app_icon_url',coalesce(v_brand.app_icon_url,v_brand.logo_url,v_prev.snapshot->>'app_icon_url'),
    'splash_url',coalesce(v_brand.splash_url,v_brand.logo_url,v_prev.snapshot->>'splash_url'),
    'primary_color',v_brand.primary_color,
    'secondary_color',v_brand.secondary_color,
    'background_color',v_brand.background_color
  );

  insert into public.church_apk_builds(
    organization_id,unit_id,requested_by,status,android_package,app_scheme,
    branded_push,snapshot,release_id,version_name,version_code
  ) values (
    p_organization_id,v_prev.unit_id,(select auth.uid()),'queued',
    v_prev.android_package,v_prev.app_scheme,v_prev.branded_push,
    v_snapshot,p_release_id,v_release.version_name,v_release.version_code
  ) returning * into v_build;

  perform app_private.write_audit(
    p_organization_id,v_prev.unit_id,'organization.apk_update_requested',
    'church_apk_builds',v_build.id,
    jsonb_build_object('release_id',p_release_id,'version_code',v_release.version_code)
  );
  return jsonb_build_object('id',v_build.id,'status',v_build.status,'existing',false);
end;
$$;
revoke all on function public.request_church_app_update(uuid,uuid) from public, anon;
grant execute on function public.request_church_app_update(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
