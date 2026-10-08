-- ELO App Factory v52: plano é verificado no servidor.
-- Configuração de departamentos permanece GRATUITA em todos os planos.
update public.subscription_plans
set features = coalesce(features,'{}'::jsonb) || '{"branded_push":true}'::jsonb
where code in ('ELO_WHITE_LABEL','ELO_REDE');

create table if not exists public.church_apk_builds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued','building','ready','failed')),
  android_package text not null,
  app_scheme text not null,
  branded_push boolean not null default false,
  snapshot jsonb not null,
  artifact_path text,
  build_url text,
  failure_reason text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  foreign key (unit_id, organization_id) references public.units(id, organization_id) on delete cascade,
  constraint apk_path_only_when_ready check (
    (status='ready' and artifact_path is not null)
    or (status<>'ready' and artifact_path is null)
  )
);
create index if not exists church_apk_builds_org_date_idx
 on public.church_apk_builds(organization_id,created_at desc);
create index if not exists church_apk_builds_requested_by_idx
 on public.church_apk_builds(requested_by);
create index if not exists church_apk_builds_unit_org_idx
 on public.church_apk_builds(unit_id,organization_id);
create unique index if not exists church_apk_builds_active_org_idx
 on public.church_apk_builds(organization_id) where status in ('queued','building');

alter table public.church_apk_builds enable row level security;
revoke all on public.church_apk_builds from anon,authenticated;
grant select on public.church_apk_builds to authenticated;
create policy church_apk_builds_admin_read on public.church_apk_builds
 for select to authenticated using (
  (select auth.uid()) is not null
  and app_private.has_permission(organization_id,'organization.manage',null)
 );

-- APK é privado e assinado pelo Supabase: apenas administração autenticada baixa.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('elo-church-apks','elo-church-apks',false,100000000,
        array['application/vnd.android.package-archive','application/octet-stream'])
 on conflict(id) do update set public=false;
create policy church_apk_download_by_admin on storage.objects
 for select to authenticated using (
   bucket_id='elo-church-apks'
   and (select auth.uid()) is not null
   and app_private.has_permission(
     case when split_part(name,'/',1) ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then split_part(name,'/',1)::uuid else null::uuid end,
     'organization.manage',null
   )
 );

create or replace function public.request_church_apk(
  p_organization_id uuid,
  p_unit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_plan jsonb;
  v_org public.organizations%rowtype;
  v_branding jsonb;
  v_structure public.church_structure_settings%rowtype;
  v_active public.church_apk_builds%rowtype;
  v_build public.church_apk_builds%rowtype;
  v_hex text;
  v_prefix text;
begin
  if auth.uid() is null or not
    app_private.has_permission(p_organization_id,'organization.manage',null)
    then raise exception 'Somente a administração pode solicitar o APK.'
       using errcode='42501';
  end if;

  v_plan:=public.get_organization_plan_context(p_organization_id);
  if coalesce((v_plan->'features'->>'standalone_apk')::boolean,false) is distinct from true then
    raise exception 'APK exclusivo disponível apenas nos planos Elo Rede e Elo White Label.'
      using errcode='42501';
  end if;

  select * into v_org from public.organizations
   where id=p_organization_id and status='active';
  if not found then raise exception 'Igreja não encontrada'; end if;

  select * into v_structure from public.church_structure_settings
   where organization_id=p_organization_id and unit_id=p_unit_id;
  if not found then
    raise exception 'Conclua primeiro a configuração estrutural da igreja.';
  end if;

  if coalesce(v_org.logo_url,'')='' then
    raise exception 'Envie a logo da igreja antes de solicitar o aplicativo.';
  end if;
  v_prefix:='/storage/v1/object/public/church-branding/'||p_organization_id::text||'/';
  if position(v_prefix in v_org.logo_url)=0
   or (v_org.app_icon_url is not null and position(v_prefix in v_org.app_icon_url)=0)
   or (v_org.splash_url is not null and position(v_prefix in v_org.splash_url)=0)
  then raise exception 'Arquivo da marca da igreja inválido'; end if;

  -- Mesmo package sempre, para que instalações futuras sejam atualizações.
  v_hex:=replace(p_organization_id::text,'-','');
  v_branding:=jsonb_build_object(
    'organization_id',p_organization_id,
    'unit_id',p_unit_id,
    'app_name',coalesce(nullif(trim(v_org.app_name),''),v_org.name),
    'church_name',v_org.name,
    'logo_url',v_org.logo_url,
    'app_icon_url',coalesce(v_org.app_icon_url,v_org.logo_url),
    'splash_url',coalesce(v_org.splash_url,v_org.logo_url),
    'primary_color',v_org.primary_color,
    'secondary_color',v_org.secondary_color,
    'background_color',v_org.background_color,
    'ministry_scope',v_structure.ministry_scope,
    'departments',v_structure.departments,
    'ministries',v_structure.ministries,
    'push_branded',coalesce((v_plan->'features'->>'branded_push')::boolean,false)
  );

  select * into v_active from public.church_apk_builds
   where organization_id=p_organization_id and status in ('queued','building')
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('id',v_active.id,'status',v_active.status,
                             'existing',true);
  end if;

  insert into public.church_apk_builds (
    organization_id,unit_id,requested_by,status,android_package,app_scheme,
    branded_push,snapshot
  ) values (
    p_organization_id,p_unit_id,auth.uid(),'queued',
    'br.com.nethanel.elo.c'||v_hex,
    'elo'||substring(v_hex,1,20),
    coalesce((v_plan->'features'->>'branded_push')::boolean,false),
    v_branding
  ) returning * into v_build;

  perform app_private.write_audit(p_organization_id,p_unit_id,
    'organization.apk_requested','church_apk_builds',v_build.id,
    jsonb_build_object('plan',v_plan->>'effective_plan_code',
                       'branded_push',v_build.branded_push));

  return jsonb_build_object('id',v_build.id,'status',v_build.status,
                            'existing',false);
end;
$function$;
revoke all on function public.request_church_apk(uuid,uuid) from public,anon;
grant execute on function public.request_church_apk(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
