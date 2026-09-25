create or replace function public.create_organization_with_code(
  p_name text,
  p_unit_name text default null,
  p_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth', 'app_private', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_org_id uuid;
  v_join_code text;
begin
  v_result := public.create_organization(
    p_name,
    p_unit_name,
    p_slug
  );

  v_org_id :=
    nullif(
      v_result ->> 'organization_id',
      ''
    )::uuid;

  select o.join_code
  into v_join_code
  from public.organizations o
  where o.id = v_org_id
    and o.created_by = auth.uid();

  if v_join_code is null then
    raise exception 'Não foi possível obter o código da igreja.';
  end if;

  return
    v_result ||
    jsonb_build_object(
      'join_code',
      v_join_code
    );
end;
$function$;

revoke all
on function public.create_organization_with_code(text, text, text)
from public, anon;

grant execute
on function public.create_organization_with_code(text, text, text)
to authenticated;
