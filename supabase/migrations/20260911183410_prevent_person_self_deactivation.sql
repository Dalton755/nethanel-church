create or replace function app_private.prevent_person_self_deactivation()
returns trigger
language plpgsql
security definer
set search_path to
    'public',
    'auth',
    'app_private',
    'pg_temp'
as $function$
begin
    if old.auth_user_id = auth.uid()
       and old.record_status = 'active'
       and new.record_status <> 'active' then

        raise exception
            'You cannot deactivate your own person record'
            using errcode = '42501';
    end if;

    return new;
end;
$function$;


drop trigger if exists
    people_prevent_self_deactivation
on public.people;


create trigger
    people_prevent_self_deactivation
before update of record_status
on public.people
for each row
execute function
    app_private.prevent_person_self_deactivation();


notify pgrst, 'reload schema';