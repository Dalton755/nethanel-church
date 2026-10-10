-- Elo App Factory v55 — estado de Push por igreja, sem credenciais privadas.
alter table public.church_firebase_android_apps
  add column if not exists expo_fcm_verified_at timestamptz,
  add column if not exists expo_fcm_verified_by text,
  add column if not exists firebase_registration_source text not null default 'manual'
    check (firebase_registration_source in ('manual','management_api'));

-- Associação FCM V1 existente validada mediante Push recebido e navegação correta
-- no Android da Adoradores Church em 09/10/2026.
update public.church_firebase_android_apps
set expo_fcm_verified_at=coalesce(expo_fcm_verified_at,now()),
    expo_fcm_verified_by='android_field_test_2026_10_09',
    updated_at=now()
where organization_id='dfe3dfb7-37be-4120-a46a-8f010beaabc3'::uuid
  and firebase_project_id='nethanel-elo'
  and android_package='br.com.nethanel.elo.cdfe3dfb737be4120a46a8f010beaabc3';

create or replace function public.get_church_apk_setup_status(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=''
as $$
declare
  v_firebase public.church_firebase_android_apps%rowtype;
  v_plan jsonb;
  v_package text;
begin
  if auth.uid() is null or not app_private.has_permission(
       p_organization_id,'organization.manage',null
     ) then
     raise exception 'Acesso permitido apenas à administração da igreja.'
       using errcode='42501';
  end if;

  v_plan:=public.get_organization_plan_context(p_organization_id);
  v_package:='br.com.nethanel.elo.c'||
       replace(p_organization_id::text,'-','');
  select * into v_firebase from public.church_firebase_android_apps
    where organization_id=p_organization_id;

  return jsonb_build_object(
    'android_package',v_package,
    'standalone_apk',coalesce((v_plan->'features'->>'standalone_apk')::boolean,false),
    'branded_push',coalesce((v_plan->'features'->>'branded_push')::boolean,false),
    'firebase_registered',
       v_firebase.android_package is not null
       and v_firebase.android_package=v_package,
    'expo_fcm_verified',
       v_firebase.expo_fcm_verified_at is not null,
    'firebase_project_id',v_firebase.firebase_project_id,
    'firebase_registration_source',v_firebase.firebase_registration_source
  );
end
$$;
revoke all on function public.get_church_apk_setup_status(uuid) from public,anon,authenticated;
grant execute on function public.get_church_apk_setup_status(uuid) to authenticated;

create index if not exists church_firebase_fcm_status_idx
  on public.church_firebase_android_apps(expo_fcm_verified_at)
  where expo_fcm_verified_at is null;
notify pgrst,'reload schema';
