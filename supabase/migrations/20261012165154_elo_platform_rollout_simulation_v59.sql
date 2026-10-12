
create or replace function public.platform_admin_update_distribution_preview(
  p_release_id uuid, p_organization_ids uuid[] default null
) returns jsonb language plpgsql stable security definer
set search_path to pg_catalog, public, app_private
as $fn$
declare
  v_release public.church_app_releases%rowtype;
  v_org record;
  v_plan jsonb;
  v_last record;
  v_busy record;
  v_latest_code integer;
  v_state text;
  v_message text;
  v_rows jsonb := '[]'::jsonb;
  v_ok integer := 0;
  v_prepared integer := 0;
  v_blocked integer := 0;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Acesso restrito a plataforma.' using errcode='42501';
  end if;
  if p_organization_ids is not null and
    (cardinality(p_organization_ids)>50 or array_position(p_organization_ids,null::uuid) is not null)
  then raise exception 'Selecao de igrejas invalida.' using errcode='22023'; end if;
  select * into v_release from public.church_app_releases where id=p_release_id;
  if not found then raise exception 'Versao nao encontrada.' using errcode='22023'; end if;

  for v_org in select o.id,o.name,o.status from public.organizations o
    where p_organization_ids is null or o.id=any(p_organization_ids)
    order by o.name
  loop
    v_plan:=public.get_organization_plan_context(v_org.id);
    select b.id,b.version_code,b.version_name,b.android_package into v_last
      from public.church_apk_builds b
      where b.organization_id=v_org.id and b.status='ready' and b.artifact_path is not null
      order by b.finished_at desc nulls last,b.created_at desc limit 1;
    select b.id,b.status into v_busy from public.church_apk_builds b
      where b.organization_id=v_org.id and b.status in ('queued','building')
      order by b.created_at desc limit 1;
    select max(b.version_code) into v_latest_code from public.church_apk_builds b
      where b.organization_id=v_org.id and b.status='ready';

    v_state:='eligible_for_preflight';
    v_message:='Pronta para verificacao de APK, assinatura e versionCode antes de gerar.';
    if v_release.status in ('paused','rolled_back') then
      v_state:='release_blocked'; v_message:='Versao pausada ou retirada.';
    elsif v_org.status<>'active' then
      v_state:='inactive'; v_message:='Igreja inativa.';
    elsif v_release.channel='preview' and
      v_org.id<>'101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid then
      v_state:='demo_only'; v_message:='Canal preview restrito ao Elo Church Demo.';
    elsif coalesce((v_plan->'features'->>'standalone_apk')::boolean,false) is distinct from true then
      v_state:='plan_not_eligible'; v_message:='Plano atual nao habilita APK exclusivo.';
    elsif v_last.id is null then
      v_state:='missing_base_apk'; v_message:='Primeiro APK nao concluido.';
    elsif v_last.android_package is distinct from
      ('br.com.nethanel.elo.c'||replace(v_org.id::text,'-','')) then
      v_state:='identity_mismatch'; v_message:='Pacote Android divergente. Revisao necessaria.';
    elsif v_latest_code>=v_release.version_code then
      if exists(select 1 from public.church_apk_builds b
       where b.organization_id=v_org.id and b.release_id=v_release.id and b.status='ready')
      then
        v_state:='already_prepared'; v_message:='APK deste release pronto para a igreja.';
      else
        v_state:='version_not_newer'; v_message:='Igreja ja possui APK com versao igual ou superior.';
      end if;
    elsif v_busy.id is not null then
      v_state:='build_in_progress'; v_message:='Existe uma solicitacao pendente ou compilando.';
    end if;

    if v_state='eligible_for_preflight' then v_ok:=v_ok+1;
    elsif v_state='already_prepared' then v_prepared:=v_prepared+1;
    else v_blocked:=v_blocked+1; end if;

    v_rows:=v_rows || jsonb_build_array(jsonb_build_object(
      'organization_id',v_org.id,'church_name',v_org.name,
      'status',v_state,'reason',v_message,
      'last_ready_code',v_latest_code,'last_ready_version',v_last.version_name,
      'effective_plan_code',v_plan->>'effective_plan_code',
      'in_progress_status',v_busy.status
    ));
  end loop;

  return jsonb_build_object(
    'release_id',v_release.id,'version_name',v_release.version_name,
    'version_code',v_release.version_code,'channel',v_release.channel,
    'release_status',v_release.status,'items',v_rows,
    'eligible_for_preflight',v_ok,'already_prepared',v_prepared,
    'blocked',v_blocked,'execution_enabled',false,
    'requires_owner_approval',true
  );
end;
$fn$;
revoke all on function public.platform_admin_update_distribution_preview(uuid,uuid[])
from public,anon;
grant execute on function public.platform_admin_update_distribution_preview(uuid,uuid[])
to authenticated;
notify pgrst,'reload schema';
