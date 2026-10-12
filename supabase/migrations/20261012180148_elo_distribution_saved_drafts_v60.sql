-- Elo v60: guardar selecoes para futura aprovacao; nunca executar distribuicao.
create table if not exists public.platform_app_distribution_plans (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.church_app_releases(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 3 and 100),
  organization_ids uuid[] not null check (cardinality(organization_ids) between 1 and 50),
  status text not null default 'draft' check(status in ('draft','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists platform_app_distribution_plans_release_idx
  on public.platform_app_distribution_plans(release_id, created_at desc);
alter table public.platform_app_distribution_plans enable row level security;
revoke all on public.platform_app_distribution_plans from public,anon,authenticated;
grant select,insert,update,delete on public.platform_app_distribution_plans to service_role;

create or replace function public.platform_admin_save_distribution_draft(
  p_release_id uuid,
  p_name text,
  p_organization_ids uuid[]
)
returns uuid
language plpgsql security definer
set search_path to pg_catalog, public, app_private
as $$
declare
  v_release public.church_app_releases%rowtype;
  v_count integer;
  v_id uuid;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da Nethanel.' using errcode='42501';
  end if;
  select * into v_release
  from public.church_app_releases
  where id=p_release_id and status in ('draft','testing');
  if not found then
    raise exception 'Apenas rascunhos ou versoes de teste permitem planejar.' using errcode='22023';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 3 and 100 or
    p_organization_ids is null or cardinality(p_organization_ids) not between 1 and 50 or
    array_position(p_organization_ids,null::uuid) is not null then
    raise exception 'Nome ou selecao invalidos.' using errcode='22023';
  end if;
  select count(distinct x) into v_count from unnest(p_organization_ids) x;
  if v_count <> cardinality(p_organization_ids) or
     v_count <> (select count(*) from public.organizations where id=any(p_organization_ids)) then
    raise exception 'Selecao contem repeticoes ou igrejas inexistentes.' using errcode='22023';
  end if;
  if v_release.channel='preview' and not (
    cardinality(p_organization_ids)=1 and
    p_organization_ids[1]='101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid
  ) then
    raise exception 'Apenas o Elo Church Demo pode participar da previa.' using errcode='42501';
  end if;
  insert into public.platform_app_distribution_plans(
    release_id,name,organization_ids,created_by
  ) values (
    p_release_id,trim(p_name),p_organization_ids,(select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.platform_admin_save_distribution_draft(uuid,text,uuid[])
  from public,anon;
grant execute on function public.platform_admin_save_distribution_draft(uuid,text,uuid[])
  to authenticated;

create or replace function public.platform_admin_list_distribution_drafts(
  p_release_id uuid
)
returns jsonb
language plpgsql stable security definer
set search_path to pg_catalog, public, app_private
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da Nethanel.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'name',p.name,
    'created_at',p.created_at,
    'status',p.status,
    'organization_count',cardinality(p.organization_ids),
    'organization_ids',p.organization_ids,
    'execution_enabled',false
  ) order by p.created_at desc),'[]'::jsonb)
  into v_result
  from public.platform_app_distribution_plans p
  where p.release_id=p_release_id
  ;
  return v_result;
end;
$$;
revoke all on function public.platform_admin_list_distribution_drafts(uuid) from public,anon;
grant execute on function public.platform_admin_list_distribution_drafts(uuid) to authenticated;

notify pgrst,'reload schema';