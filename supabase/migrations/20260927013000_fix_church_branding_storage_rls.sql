-- Fix church branding Storage RLS for upload/upsert operations.

drop policy if exists church_branding_select_member on storage.objects;
create policy church_branding_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id='church-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then app_private.is_org_member(
      ((storage.foldername(name))[1])::uuid
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
