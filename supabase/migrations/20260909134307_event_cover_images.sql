-- ============================================================
-- NETHANEL CHURCH
-- Imagens de capa da Agenda
-- ============================================================

alter table public.events
add column cover_image_path text;

-- Bucket privado.
-- A imagem será acessada através de URL temporária assinada.

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'event-covers',
    'event-covers',
    false,
    5242880,
    array[
        'image/jpeg',
        'image/png',
        'image/webp'
    ]
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Caminho esperado:
--
-- organization_id/unit_id/event_id/cover.jpg

create policy "event_covers_select_member"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'event-covers'
    and case
        when (storage.foldername(name))[1]
             ~* '^[0-9a-f-]{36}$'
        then app_private.is_org_member(
            ((storage.foldername(name))[1])::uuid
        )
        else false
    end
);

create policy "event_covers_insert_manager"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'event-covers'
    and case
        when
            (storage.foldername(name))[1]
                ~* '^[0-9a-f-]{36}$'
            and
            (storage.foldername(name))[2]
                ~* '^[0-9a-f-]{36}$'
        then app_private.has_permission(
            ((storage.foldername(name))[1])::uuid,
            'agenda.manage',
            ((storage.foldername(name))[2])::uuid
        )
        else false
    end
);

create policy "event_covers_update_manager"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'event-covers'
    and case
        when
            (storage.foldername(name))[1]
                ~* '^[0-9a-f-]{36}$'
            and
            (storage.foldername(name))[2]
                ~* '^[0-9a-f-]{36}$'
        then app_private.has_permission(
            ((storage.foldername(name))[1])::uuid,
            'agenda.manage',
            ((storage.foldername(name))[2])::uuid
        )
        else false
    end
)
with check (
    bucket_id = 'event-covers'
);

create policy "event_covers_delete_manager"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'event-covers'
    and case
        when
            (storage.foldername(name))[1]
                ~* '^[0-9a-f-]{36}$'
            and
            (storage.foldername(name))[2]
                ~* '^[0-9a-f-]{36}$'
        then app_private.has_permission(
            ((storage.foldername(name))[1])::uuid,
            'agenda.manage',
            ((storage.foldername(name))[2])::uuid
        )
        else false
    end
);

notify pgrst, 'reload schema';