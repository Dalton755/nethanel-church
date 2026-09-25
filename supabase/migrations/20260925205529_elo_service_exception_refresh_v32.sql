create or replace function app_private.materialize_service_exception_change()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
begin
  perform app_private.materialize_service_agenda(
    coalesce(new.organization_id,old.organization_id),
    current_date-45,
    400
  );

  return coalesce(new,old);
end;
$function$;

revoke all on function app_private.materialize_service_exception_change()
from public,anon,authenticated;

drop trigger if exists service_exceptions_materialize_now
on public.service_exceptions;

create trigger service_exceptions_materialize_now
after insert or update or delete
on public.service_exceptions
for each row
execute function app_private.materialize_service_exception_change();
