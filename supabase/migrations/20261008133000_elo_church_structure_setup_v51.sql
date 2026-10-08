-- ELO v51 — onboarding estrutural por igreja/unidade, sem bloqueio por plano.
-- Quantidades informadas são estimativas de planejamento, nunca membros cadastrados.

create table if not exists public.church_structure_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null,
  estimated_members integer check (estimated_members between 0 and 1000000),
  ministry_scope text not null default 'local'
    check (ministry_scope in ('local','congregations','regional','missions')),
  departments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(departments)='array'),
  ministries jsonb not null default '[]'::jsonb
    check (jsonb_typeof(ministries)='array'),
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, unit_id),
  foreign key (unit_id,organization_id)
    references public.units(id,organization_id) on delete cascade
);

alter table public.church_structure_settings enable row level security;
revoke all on public.church_structure_settings from anon, authenticated;
grant select on public.church_structure_settings to authenticated;

drop policy if exists church_structure_read_org on public.church_structure_settings;
create policy church_structure_read_org
on public.church_structure_settings for select to authenticated
using ((select auth.uid()) is not null
  and app_private.is_org_member(organization_id));

create or replace function public.get_church_structure(
  p_organization_id uuid,
  p_unit_id uuid
)
returns jsonb
language plpgsql stable security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare v_structure public.church_structure_settings%rowtype;
begin
  if auth.uid() is null or not app_private.is_org_member(p_organization_id)
     or not exists (
       select 1 from public.units u
       where u.id=p_unit_id and u.organization_id=p_organization_id
     ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select * into v_structure from public.church_structure_settings
   where organization_id=p_organization_id and unit_id=p_unit_id;

  if not found then
    return jsonb_build_object(
      'configured',false,'estimated_members',null,
      'ministry_scope','local','departments','[]'::jsonb,
      'ministries','[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'configured',true,'estimated_members',v_structure.estimated_members,
    'ministry_scope',v_structure.ministry_scope,
    'departments',v_structure.departments,
    'ministries',v_structure.ministries
  );
end;
$function$;

revoke all on function public.get_church_structure(uuid,uuid) from public,anon;
grant execute on function public.get_church_structure(uuid,uuid) to authenticated;

create or replace function public.save_church_structure(
  p_organization_id uuid,
  p_unit_id uuid,
  p_estimated_members integer,
  p_ministry_scope text,
  p_departments jsonb,
  p_ministries jsonb
)
returns jsonb
language plpgsql security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_item jsonb;
  v_function jsonb;
  v_key text;
  v_name text;
  v_people integer;
  v_function_name text;
  v_required integer;
  v_department_id uuid;
  v_functions jsonb;
  v_keys text[]:=array[]::text[];
  v_ministry_keys text[]:=array[]::text[];
  v_department_count integer:=0;
  v_function_count integer:=0;
begin
  if auth.uid() is null
    or not exists (
      select 1 from public.units u
      where u.id=p_unit_id and u.organization_id=p_organization_id
    )
    or not (
      app_private.has_permission(p_organization_id,'organization.manage',p_unit_id)
      or app_private.has_permission(p_organization_id,'departments.manage',p_unit_id)
    ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if p_ministry_scope not in ('local','congregations','regional','missions')
    or p_estimated_members is not null
       and (p_estimated_members<0 or p_estimated_members>1000000)
    or jsonb_typeof(p_departments) is distinct from 'array'
    or jsonb_typeof(p_ministries) is distinct from 'array'
    or jsonb_array_length(p_departments)>40
    or jsonb_array_length(p_ministries)>40 then
    raise exception 'Invalid church structure';
  end if;

  -- Validar toda a entrada ANTES de alterar qualquer equipe.
  for v_item in select value from jsonb_array_elements(p_departments)
  loop
    v_key:=v_item->>'key';
    v_name:=trim(coalesce(v_item->>'name',''));
    if v_key is null or v_key !~ '^[a-z0-9_]{2,40}$'
       or v_key=any(v_keys) or length(v_name)<2 or length(v_name)>80
       or jsonb_typeof(v_item->'estimated_people') is distinct from 'number'
       or (v_item->>'estimated_people') !~ '^[0-9]{1,6}$' then
      raise exception 'Invalid or duplicate department';
    end if;
    v_people:=(v_item->>'estimated_people')::integer;
    if v_people>100000 then raise exception 'Invalid team estimate'; end if;
    v_keys:=array_append(v_keys,v_key);
    v_functions:=v_item->'functions';
    if jsonb_typeof(v_functions) is distinct from 'array'
       or jsonb_array_length(v_functions)>25 then
      raise exception 'Invalid department functions';
    end if;
    for v_function in select value from jsonb_array_elements(v_functions)
    loop
      v_function_name:=trim(coalesce(v_function->>'name',''));
      if length(v_function_name)<2 or length(v_function_name)>80
         or jsonb_typeof(v_function->'required_count') is distinct from 'number'
         or (v_function->>'required_count') !~ '^[0-9]{1,2}$'
         or (v_function->>'required_count')::integer not between 1 and 50 then
        raise exception 'Invalid schedule function';
      end if;
    end loop;
  end loop;

  for v_item in select value from jsonb_array_elements(p_ministries)
  loop
    v_key:=v_item->>'key';
    v_name:=trim(coalesce(v_item->>'name',''));
    if v_key is null or v_key !~ '^[a-z0-9_]{2,40}$'
       or v_key=any(v_ministry_keys)
       or length(v_name)<2 or length(v_name)>80 then
      raise exception 'Invalid or duplicate ministry';
    end if;
    v_ministry_keys:=array_append(v_ministry_keys,v_key);
  end loop;

  -- Upsert por chave estrutural; reutilizar equipes existentes com o mesmo nome.
  -- Não apagar pessoas ou escalas: desativação lógica apenas nos departamentos
  -- criados por este configurador que deixaram de ser selecionados.
  for v_item in select value from jsonb_array_elements(p_departments)
  loop
    v_key:=v_item->>'key';
    v_name:=trim(v_item->>'name');
    v_people:=(v_item->>'estimated_people')::integer;

    select d.id into v_department_id
    from public.departments d
    where d.organization_id=p_organization_id and d.unit_id=p_unit_id
      and (d.system_key='structure:'||v_key or lower(d.name)=lower(v_name))
    order by (d.system_key='structure:'||v_key) desc, d.active desc
    limit 1 for update;

    if v_department_id is null then
      insert into public.departments (
        organization_id,unit_id,name,description,system_key,active,created_by
      ) values (
        p_organization_id,p_unit_id,v_name,
        'Departamento configurado na estrutura da igreja.',
        'structure:'||v_key,true,auth.uid()
      ) returning id into v_department_id;
    else
      update public.departments set
        active=true,updated_at=now()
      where id=v_department_id and organization_id=p_organization_id;
    end if;

    v_department_count:=v_department_count+1;

    for v_function in select value from jsonb_array_elements(v_item->'functions')
    loop
      v_function_name:=trim(v_function->>'name');
      v_required:=(v_function->>'required_count')::integer;
      -- Não substituir customizações de escala feitas pelos líderes.
      if not exists(
        select 1 from public.department_functions f
        where f.organization_id=p_organization_id
          and f.department_id=v_department_id
          and f.active=true and lower(f.name)=lower(v_function_name)
      ) then
        insert into public.department_functions(
          organization_id,department_id,name,default_required_count,
          sort_order,active,created_by
        ) values (
          p_organization_id,v_department_id,v_function_name,v_required,
          coalesce((
            select max(sort_order)+1 from public.department_functions
            where organization_id=p_organization_id
              and department_id=v_department_id
          ),0),true,auth.uid()
        );
        v_function_count:=v_function_count+1;
      end if;
    end loop;
    v_department_id:=null;
  end loop;

  update public.departments d
  set active=false,updated_at=now()
  where d.organization_id=p_organization_id and d.unit_id=p_unit_id
    and d.active=true and d.system_key like 'structure:%'
    and not (substring(d.system_key from 11)=any(v_keys));

  insert into public.church_structure_settings (
    organization_id,unit_id,estimated_members,ministry_scope,
    departments,ministries,updated_by
  ) values (
    p_organization_id,p_unit_id,p_estimated_members,p_ministry_scope,
    p_departments,p_ministries,auth.uid()
  )
  on conflict (organization_id,unit_id) do update set
    estimated_members=excluded.estimated_members,
    ministry_scope=excluded.ministry_scope,
    departments=excluded.departments,
    ministries=excluded.ministries,
    updated_by=excluded.updated_by,
    updated_at=now();

  perform app_private.write_audit(
    p_organization_id,p_unit_id,'organization.structure_updated',
    'church_structure_settings',p_organization_id,
    jsonb_build_object(
      'departments',jsonb_array_length(p_departments),
      'ministries',jsonb_array_length(p_ministries)
    )
  );

  return jsonb_build_object(
    'configured',true,'departments',v_department_count,
    'functions_created',v_function_count
  );
end;
$function$;

revoke all on function public.save_church_structure(uuid,uuid,integer,text,jsonb,jsonb)
  from public,anon;
grant execute on function public.save_church_structure(uuid,uuid,integer,text,jsonb,jsonb)
  to authenticated;

-- Aplica a estrutura escolhida SOMENTE à ocorrência específica de um culto.
-- Não escala pessoas fictícias e não altera outras datas.
create or replace function public.apply_church_structure_event_templates(
  p_organization_id uuid,
  p_unit_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_department record;
  v_count integer:=0;
  v_functions integer:=0;
  v_result jsonb;
begin
  if auth.uid() is null or not app_private.has_permission(
    p_organization_id,'schedules.manage',p_unit_id
  ) then raise exception 'Permission denied' using errcode='42501'; end if;

  if not exists(
    select 1 from public.events e
    where e.id=p_event_id and e.organization_id=p_organization_id
      and e.unit_id=p_unit_id and e.status='published'
  ) then raise exception 'Service not found'; end if;

  for v_department in
    select d.id
    from public.departments d
    join public.church_structure_settings c
      on c.organization_id=d.organization_id and c.unit_id=d.unit_id
    where d.organization_id=p_organization_id and d.unit_id=p_unit_id
      and d.active=true
      and exists (
        select 1 from jsonb_array_elements(c.departments) item
        where item->>'key'=replace(d.system_key,'structure:','')
          or lower(item->>'name')=lower(d.name)
      )
      and exists(
        select 1 from public.department_functions f
        where f.department_id=d.id and f.organization_id=d.organization_id
          and f.active=true
      )
  loop
    v_result:=public.apply_department_schedule_template(
      p_organization_id,v_department.id,p_event_id
    );
    v_count:=v_count+1;
    v_functions:=v_functions+coalesce((v_result->>'functions_applied')::integer,0);
  end loop;

  return jsonb_build_object('departments_applied',v_count,'functions_applied',v_functions);
end;
$function$;

revoke all on function public.apply_church_structure_event_templates(uuid,uuid,uuid)
  from public,anon;
grant execute on function public.apply_church_structure_event_templates(uuid,uuid,uuid)
  to authenticated;

notify pgrst,'reload schema';
