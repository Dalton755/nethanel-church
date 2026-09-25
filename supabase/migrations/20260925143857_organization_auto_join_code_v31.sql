create or replace function app_private.generate_organization_join_code()
returns text
language plpgsql
security definer
set search_path = 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;

    v_code :=
      'ELO-' ||
      upper(
        substring(
          replace(gen_random_uuid()::text, '-', ''),
          1,
          6
        )
      );

    exit when not exists (
      select 1
      from public.organizations o
      where lower(o.join_code) = lower(v_code)
    );

    if v_attempt >= 50 then
      raise exception 'Não foi possível gerar um código único para a igreja.';
    end if;
  end loop;

  return v_code;
end;
$function$;

revoke all on function app_private.generate_organization_join_code() from public, anon, authenticated;

create or replace function app_private.ensure_organization_join_code()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'app_private', 'pg_temp'
as $function$
begin
  if new.join_code is null or trim(new.join_code) = '' then
    new.join_code := app_private.generate_organization_join_code();
  else
    new.join_code := upper(trim(new.join_code));
  end if;

  return new;
end;
$function$;

revoke all on function app_private.ensure_organization_join_code() from public, anon, authenticated;

drop trigger if exists organizations_auto_join_code on public.organizations;

create trigger organizations_auto_join_code
before insert or update of join_code
on public.organizations
for each row
execute function app_private.ensure_organization_join_code();

update public.organizations
set join_code = app_private.generate_organization_join_code()
where join_code is null
   or trim(join_code) = '';
