-- Elo Updates v56: catalogo central e distribuicao segura de APKs por igreja.
-- Adicao retrocompativel: nao altera solicitacoes ou instalacoes existentes.

create table if not exists public.church_app_releases (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('preview','production')),
  version_name text not null check (version_name ~ '^[0-9]+[.][0-9]+[.][0-9]+$'),
  version_code integer not null check (version_code > 0),
  minimum_supported_version_code integer not null default 1
    check (minimum_supported_version_code > 0 and minimum_supported_version_code <= version_code),
  update_kind text not null check (update_kind in ('apk','ota')),
  runtime_version text not null check (length(runtime_version) between 1 and 100),
  release_notes text not null default '',
  status text not null default 'draft'
    check (status in ('draft','testing','published','paused','rolled_back')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(channel,version_code),
  constraint published_releases_require_timestamp check
    (status <> 'published' or published_at is not null)
);
create index if not exists church_app_releases_live_idx
 on public.church_app_releases(channel,version_code desc)
 where status = 'published';

-- Assinatura fixa por igreja. Nunca armazenar a keystore ou segredo no banco.
create table if not exists public.church_app_identities (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  android_package text not null unique
    check (android_package ~ '^br[.]com[.]nethanel[.]elo[.]c[a-f0-9]{32}$'),
  app_scheme text not null unique
    check (app_scheme ~ '^elo[a-f0-9]{20}$'),
  signing_certificate_sha256 text
    check (signing_certificate_sha256 ~ '^[a-f0-9]{64}$'),
  last_verified_version_code integer not null default 0
    check (last_verified_version_code >= 0),
  updated_at timestamptz not null default now()
);
comment on column public.church_app_identities.signing_certificate_sha256 is
  'Fingerprint publico do certificado, nunca a chave privada. Deve corresponder ao APK anteriormente distribuido.';

alter table public.church_apk_builds
  add column if not exists release_id uuid references public.church_app_releases(id),
  add column if not exists version_name text,
  add column if not exists version_code integer,
  add column if not exists signing_certificate_sha256 text;
create index if not exists church_apk_builds_release_idx
 on public.church_apk_builds(release_id,organization_id,status);
create unique index if not exists church_apk_builds_one_code_per_org_idx
 on public.church_apk_builds(organization_id,version_code)
 where version_code is not null and status='ready';

-- Catalogo/identidade privados. Somente o backend de distribuicao gerencia.
alter table public.church_app_releases enable row level security;
alter table public.church_app_identities enable row level security;
revoke all on public.church_app_releases from public, anon, authenticated;
revoke all on public.church_app_identities from public, anon, authenticated;
grant select, insert, update, delete on public.church_app_releases to service_role;
grant select, insert, update, delete on public.church_app_identities to service_role;

-- Leitura de atualizacao: autenticacao + pertinencia a propria igreja +
-- identificador Android correto. Nenhum link temporario ou APK de teste e exposto.
create or replace function public.get_church_app_update(
  p_organization_id uuid,
  p_android_package text,
  p_installed_version_code integer
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_release record;
  v_expected text;
begin
  if (select auth.uid()) is null
     or not app_private.is_org_member(p_organization_id) then
    raise exception 'Acesso nao autorizado.' using errcode='42501';
  end if;
  v_expected := 'br.com.nethanel.elo.c'||replace(p_organization_id::text,'-','');
  if p_android_package is distinct from v_expected
     or p_installed_version_code is null
     or p_installed_version_code < 0 then
    raise exception 'Identidade ou versao invalida.' using errcode='22023';
  end if;

  select r.id, r.version_name, r.version_code, r.minimum_supported_version_code,
         r.release_notes, r.runtime_version, b.artifact_path
    into v_release
  from public.church_app_releases r
  join public.church_apk_builds b
    on b.release_id=r.id
   and b.organization_id=p_organization_id
   and b.android_package=p_android_package
   and b.status='ready'
   and b.version_code=r.version_code
   and b.artifact_path is not null
  where r.channel='production'
    and r.status='published'
    and r.update_kind='apk'
    and r.version_code>p_installed_version_code
  order by r.version_code desc
  limit 1;

  if not found then return jsonb_build_object('available',false); end if;

  return jsonb_build_object(
    'available',true,
    'release_id',v_release.id,
    'version_name',v_release.version_name,
    'version_code',v_release.version_code,
    'runtime_version',v_release.runtime_version,
    'mandatory',p_installed_version_code < v_release.minimum_supported_version_code,
    'release_notes',v_release.release_notes,
    'artifact_path',v_release.artifact_path
  );
end;
$$;
revoke all on function public.get_church_app_update(uuid,text,integer)
 from public, anon;
grant execute on function public.get_church_app_update(uuid,text,integer)
 to authenticated;

-- A policy de Storage e executada como usuario; a consulta as tabelas
-- privadas deve ocorrer num helper restrito do schema nao exposto.
create or replace function app_private.can_download_church_release(p_artifact_path text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.church_apk_builds b
      join public.church_app_releases r on r.id=b.release_id
      where b.artifact_path=p_artifact_path
        and b.status='ready'
        and r.status='published'
        and r.channel='production'
        and r.update_kind='apk'
        and app_private.is_org_member(b.organization_id)
    );
$$;
revoke all on function app_private.can_download_church_release(text) from public, anon;
grant execute on function app_private.can_download_church_release(text) to authenticated;

-- Somente membros da propria igreja baixam APK publicado; arquivos de teste
-- e APKs historicos nao publicados continuam restritos ao administrador.
create policy church_apk_published_download_member on storage.objects
for select to authenticated
using (
  bucket_id='elo-church-apks'
  and app_private.can_download_church_release(name)
);
-- Permite solicitar a compilacao para release APROVADO em teste/publicacao.
-- A identidade anterior permanece fixa e a fila atual continua com no maximo
-- uma solicitacao ativa por igreja (indice partial legado).
create or replace function public.request_church_app_update(
  p_organization_id uuid,
  p_release_id uuid
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
    and status in ('testing','published');
  if not found then raise exception 'Release nao autorizado para build.'; end if;

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
  ) then
    raise exception 'Este release nao e mais recente que o APK da igreja.';
  end if;

  select * into v_brand from public.organizations
  where id=p_organization_id and status='active';
  if not found then raise exception 'Igreja indisponivel.'; end if;

  -- Preserva o tenant, estrutura, package e esquema ja instalados.
  -- Atualiza somente identificacao visual editavel dentro do snapshot.
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
    jsonb_build_object('release_id',p_release_id,
                       'version_code',v_release.version_code)
  );
  return jsonb_build_object('id',v_build.id,'status',v_build.status,'existing',false);
end;
$$;
revoke all on function public.request_church_app_update(uuid,uuid) from public, anon;
grant execute on function public.request_church_app_update(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
