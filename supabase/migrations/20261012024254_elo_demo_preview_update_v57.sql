-- Isolamento de release preview para igreja Demo e solicitante de APK existente.
-- Aplicada no Supabase como elo_demo_preview_update_v57.
CREATE OR REPLACE FUNCTION app_private.can_access_elo_demo_preview(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app_private'
AS $function$
  select (select auth.uid()) is not null
    and p_organization_id = '101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid
    and app_private.is_org_member(p_organization_id)
    and exists (
      select 1 from public.church_apk_builds previous
      where previous.organization_id=p_organization_id
        and previous.requested_by=(select auth.uid())
        and previous.status='ready'
        and previous.release_id is null
    );
$function$
;
revoke all on function app_private.can_access_elo_demo_preview(uuid) from public, anon;
grant execute on function app_private.can_access_elo_demo_preview(uuid) to authenticated;

CREATE OR REPLACE FUNCTION app_private.can_download_church_release(p_artifact_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app_private'
AS $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.church_apk_builds b
      join public.church_app_releases r on r.id=b.release_id
      where b.artifact_path=p_artifact_path
        and b.status='ready'
        and b.version_code=r.version_code
        and app_private.is_org_member(b.organization_id)
        and (
          (r.status='published' and r.channel='production' and r.update_kind='apk')
          or
          (r.status='testing' and r.channel='preview' and r.update_kind='apk'
            and app_private.can_access_elo_demo_preview(b.organization_id))
        )
    );
$function$
;
revoke all on function app_private.can_download_church_release(text) from public, anon;
grant execute on function app_private.can_download_church_release(text) to authenticated;

CREATE OR REPLACE FUNCTION public.get_church_app_update(p_organization_id uuid, p_android_package text, p_installed_version_code integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app_private'
AS $function$
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
         r.release_notes, r.runtime_version, b.artifact_path, r.channel
    into v_release
  from public.church_app_releases r
  join public.church_apk_builds b
    on b.release_id=r.id
   and b.organization_id=p_organization_id
   and b.android_package=p_android_package
   and b.status='ready'
   and b.version_code=r.version_code
   and b.artifact_path is not null
  where r.update_kind='apk'
    and r.version_code>p_installed_version_code
    and (
      (r.channel='production' and r.status='published')
      or
      (r.channel='preview' and r.status='testing'
       and app_private.can_access_elo_demo_preview(p_organization_id))
    )
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
    'preview',v_release.channel='preview',
    'artifact_path',v_release.artifact_path
  );
end;
$function$
;
revoke all on function public.get_church_app_update(uuid,text,integer) from public, anon;
grant execute on function public.get_church_app_update(uuid,text,integer) to authenticated;

notify pgrst, 'reload schema';
