-- ELO Kids v37
-- Pais cadastram filhos menores de 10 anos, fazem check-in de chegada,
-- liderança monta equipe/escala, libera a sala, chama responsáveis
-- e libera retirada ao final do culto.

alter table public.kids_checkins
  drop constraint if exists kids_checkins_status_check;

alter table public.kids_checkins
  add constraint kids_checkins_status_check
  check (status in ('WAITING_ROOM','ACTIVE','PICKED_UP','CANCELLED'));

drop index if exists public.kids_checkins_active_child_event_uq;

create unique index if not exists kids_checkins_open_child_event_uq
on public.kids_checkins(event_id,child_person_id)
where status in ('WAITING_ROOM','ACTIVE');

create table if not exists public.kids_event_operations (
  event_id uuid primary key,
  organization_id uuid not null,
  unit_id uuid not null,
  room_released_at timestamptz,
  room_released_by uuid references auth.users(id) on delete set null,
  pickup_released_at timestamptz,
  pickup_released_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id,organization_id)
    references public.events(id,organization_id) on delete cascade,
  foreign key (unit_id,organization_id)
    references public.units(id,organization_id) on delete cascade
);

alter table public.kids_event_operations enable row level security;

drop policy if exists kids_event_operations_select_allowed
on public.kids_event_operations;

create policy kids_event_operations_select_allowed
on public.kids_event_operations
for select
to authenticated
using (app_private.is_org_member(organization_id));

drop trigger if exists kids_event_operations_touch
on public.kids_event_operations;

create trigger kids_event_operations_touch
before update on public.kids_event_operations
for each row execute function app_private.elo_touch_updated_at();

CREATE OR REPLACE FUNCTION app_private.ensure_kids_department(p_organization_id uuid, p_unit_id uuid)
 RETURNS TABLE(department_id uuid, function_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_department_id uuid;
  v_function_id uuid;
begin
  select d.id into v_department_id
  from public.departments d
  where d.organization_id=p_organization_id
    and d.unit_id=p_unit_id
    and d.system_key='kids'
  limit 1;

  if v_department_id is null then
    insert into public.departments(
      organization_id,unit_id,name,description,
      active,system_key,created_by
    )
    values(
      p_organization_id,p_unit_id,
      'Elo Kids',
      'Equipe responsável pelo cuidado das crianças durante os cultos.',
      true,'kids',null
    )
    returning id into v_department_id;
  else
    update public.departments
    set active=true,
        updated_at=now()
    where id=v_department_id;
  end if;

  select f.id into v_function_id
  from public.department_functions f
  where f.organization_id=p_organization_id
    and f.department_id=v_department_id
    and lower(f.name)=lower('Equipe Elo Kids')
    and f.active=true
  limit 1;

  if v_function_id is null then
    insert into public.department_functions(
      organization_id,department_id,name,
      default_required_count,sort_order,active,created_by
    )
    values(
      p_organization_id,v_department_id,
      'Equipe Elo Kids',2,1,true,null
    )
    returning id into v_function_id;
  end if;

  return query select v_department_id,v_function_id;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.notify_kids_guardians_for_event(p_organization_id uuid, p_event_id uuid, p_mode text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_row record;
  v_count integer:=0;
  v_title text;
  v_body text;
begin
  if p_mode='ROOM_OPEN' then
    v_title:='Sala das crianças liberada';
    v_body:='A sala do Elo Kids já está pronta. Você pode levar seu filho até a equipe.';
  elsif p_mode='PICKUP_OPEN' then
    v_title:='Retirada das crianças liberada';
    v_body:='O culto está encerrando. Você já pode retirar seu filho no Elo Kids.';
  else
    return 0;
  end if;

  for v_row in
    select distinct
      gp.auth_user_id,
      gp.id as guardian_person_id
    from public.kids_checkins kc
    join public.kids_guardians kg
      on kg.organization_id=kc.organization_id
     and kg.child_person_id=kc.child_person_id
     and kg.active=true
    join public.people gp
      on gp.id=kg.guardian_person_id
     and gp.organization_id=kg.organization_id
     and gp.record_status='active'
    where kc.organization_id=p_organization_id
      and kc.event_id=p_event_id
      and gp.auth_user_id is not null
      and (
        (p_mode='ROOM_OPEN' and kc.status='WAITING_ROOM')
        or
        (p_mode='PICKUP_OPEN' and kc.status='ACTIVE')
      )
  loop
    perform app_private.enqueue_notification(
      p_organization_id,
      v_row.auth_user_id,
      v_row.guardian_person_id,
      'kids',
      v_title,
      v_body,
      jsonb_build_object(
        'event_id',p_event_id,
        'kids_action',p_mode
      ),
      'kids.'||lower(p_mode)||':'||
        p_event_id::text||':'||v_row.guardian_person_id::text
    );

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.sync_kids_staff_to_department(p_organization_id uuid, p_unit_id uuid, p_person_id uuid, p_active boolean, p_is_leader boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_department_id uuid;
  v_function_id uuid;
begin
  select x.department_id,x.function_id
  into v_department_id,v_function_id
  from app_private.ensure_kids_department(
    p_organization_id,p_unit_id
  ) x;

  insert into public.department_members(
    organization_id,department_id,person_id,
    function_name,sort_order,can_serve,status,joined_at,created_by
  )
  values(
    p_organization_id,v_department_id,p_person_id,
    'Equipe Elo Kids',100,p_active,
    case when p_active then 'active' else 'inactive' end,
    current_date,null
  )
  on conflict(department_id,person_id)
  do update set
    function_name='Equipe Elo Kids',
    can_serve=excluded.can_serve,
    status=excluded.status,
    updated_at=now();

  insert into public.department_member_functions(
    organization_id,department_id,person_id,function_id,active
  )
  values(
    p_organization_id,v_department_id,p_person_id,v_function_id,p_active
  )
  on conflict(function_id,person_id)
  do update set active=excluded.active;

  if p_is_leader then
    update public.departments
    set leader_person_id=p_person_id,
        updated_at=now()
    where id=v_department_id
      and organization_id=p_organization_id;
  elsif not p_active then
    update public.departments
    set leader_person_id=null,
        updated_at=now()
    where id=v_department_id
      and organization_id=p_organization_id
      and leader_person_id=p_person_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_kids_staff_member(p_organization_id uuid, p_unit_id uuid, p_person_id uuid, p_staff_role text DEFAULT 'VOLUNTEER'::text)
 RETURNS kids_staff_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_result public.kids_staff_members%rowtype;
  v_role text:=upper(trim(coalesce(p_staff_role,'VOLUNTEER')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.can_lead_kids(
    p_organization_id,p_unit_id
  )
  and not app_private.has_permission(
    p_organization_id,'kids.manage',p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_role not in ('LEADER','VOLUNTEER') then
    raise exception 'Função Kids inválida';
  end if;

  if v_role='LEADER'
     and not app_private.has_permission(
       p_organization_id,'kids.manage',p_unit_id
     )
  then
    raise exception 'Somente a administração pode definir a liderança do Elo Kids'
      using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.people p
    join public.unit_memberships um
      on um.person_id=p.id
     and um.organization_id=p.organization_id
    where p.id=p_person_id
      and p.organization_id=p_organization_id
      and p.record_status='active'
      and um.unit_id=p_unit_id
      and um.status='active'
  ) then
    raise exception 'Pessoa não está ativa nesta unidade';
  end if;

  if v_role='LEADER' then
    update public.kids_staff_members
    set staff_role='VOLUNTEER',
        updated_at=now()
    where organization_id=p_organization_id
      and unit_id=p_unit_id
      and active=true
      and staff_role='LEADER'
      and person_id<>p_person_id;
  end if;

  insert into public.kids_staff_members(
    organization_id,unit_id,person_id,
    staff_role,active,created_by
  )
  values(
    p_organization_id,p_unit_id,p_person_id,
    v_role,true,auth.uid()
  )
  on conflict(organization_id,unit_id,person_id)
  do update set
    staff_role=excluded.staff_role,
    active=true,
    updated_at=now()
  returning * into v_result;

  perform app_private.sync_kids_staff_to_department(
    p_organization_id,p_unit_id,p_person_id,true,v_role='LEADER'
  );

  if v_role='LEADER' then
    perform app_private.sync_kids_staff_to_department(
      p_organization_id,p_unit_id,k.person_id,true,false
    )
    from public.kids_staff_members k
    where k.organization_id=p_organization_id
      and k.unit_id=p_unit_id
      and k.active=true
      and k.person_id<>p_person_id;
  end if;

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    'kids.staff_saved','kids_staff_members',v_result.id,
    jsonb_build_object(
      'person_id',p_person_id,
      'staff_role',v_result.staff_role
    )
  );

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.checkin_my_child_arrival(p_organization_id uuid, p_unit_id uuid, p_event_id uuid, p_child_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_guardian public.kids_guardians%rowtype;
  v_event public.events%rowtype;
  v_unit public.units%rowtype;
  v_child public.people%rowtype;
  v_room public.kids_rooms%rowtype;
  v_checkin public.kids_checkins%rowtype;
  v_age_months integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select p.* into v_child
  from public.people p
  join public.kids_children c
    on c.child_person_id=p.id
   and c.organization_id=p.organization_id
   and c.active=true
  where p.id=p_child_person_id
    and p.organization_id=p_organization_id
    and p.record_status='active';

  if not found then
    raise exception 'Criança não encontrada';
  end if;

  if v_child.birth_date is null
     or v_child.birth_date<=current_date-interval '10 years'
  then
    raise exception 'O Elo Kids aceita crianças menores de 10 anos';
  end if;

  select g.* into v_guardian
  from public.kids_guardians g
  join public.people gp
    on gp.id=g.guardian_person_id
   and gp.organization_id=g.organization_id
  where g.organization_id=p_organization_id
    and g.child_person_id=p_child_person_id
    and g.active=true
    and g.can_checkin=true
    and gp.auth_user_id=auth.uid()
    and gp.record_status='active'
  limit 1;

  if not found then
    raise exception 'Você não está autorizado a fazer o check-in desta criança'
      using errcode='42501';
  end if;

  select * into v_event
  from public.events
  where id=p_event_id
    and organization_id=p_organization_id
    and unit_id=p_unit_id
    and status='published';

  if not found then
    raise exception 'Culto indisponível';
  end if;

  select * into v_unit
  from public.units
  where id=p_unit_id
    and organization_id=p_organization_id;

  if (now() at time zone v_unit.timezone)::date <>
     (v_event.starts_at at time zone v_unit.timezone)::date
  then
    raise exception 'O check-in só fica disponível no dia do culto';
  end if;

  if now()<v_event.starts_at-interval '4 hours'
     or now()>coalesce(v_event.ends_at,v_event.starts_at+interval '3 hours')
  then
    raise exception 'Check-in fora da janela do culto';
  end if;

  select * into v_checkin
  from public.kids_checkins
  where organization_id=p_organization_id
    and event_id=p_event_id
    and child_person_id=p_child_person_id
    and status in ('WAITING_ROOM','ACTIVE')
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,
      'already_checked_in',true,
      'checkin_id',v_checkin.id,
      'status',v_checkin.status
    );
  end if;

  v_age_months:=
    extract(year from age(current_date,v_child.birth_date))::int*12+
    extract(month from age(current_date,v_child.birth_date))::int;

  select r.* into v_room
  from public.kids_rooms r
  where r.organization_id=p_organization_id
    and r.unit_id=p_unit_id
    and r.active=true
    and v_age_months between r.min_age_months and r.max_age_months
  order by
    case when r.id=(
      select default_room_id
      from public.kids_children
      where child_person_id=p_child_person_id
        and organization_id=p_organization_id
    ) then 0 else 1 end,
    r.min_age_months desc,
    r.created_at
  limit 1;

  if not found then
    raise exception 'Nenhuma sala Kids atende a faixa etária desta criança';
  end if;

  insert into public.kids_checkins(
    organization_id,event_id,room_id,child_person_id,
    status,checked_in_by_user_id
  )
  values(
    p_organization_id,p_event_id,v_room.id,p_child_person_id,
    'WAITING_ROOM',auth.uid()
  )
  returning * into v_checkin;

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    'kids.arrival_checkin','kids_checkins',v_checkin.id,
    jsonb_build_object(
      'child_person_id',p_child_person_id,
      'event_id',p_event_id,
      'room_id',v_room.id
    )
  );

  return jsonb_build_object(
    'ok',true,
    'checkin_id',v_checkin.id,
    'status',v_checkin.status,
    'room_id',v_room.id,
    'room_name',v_room.name
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_kids_event_operation(p_organization_id uuid, p_unit_id uuid, p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if not app_private.is_org_member(p_organization_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select jsonb_build_object(
    'event_id',e.id,
    'event_title',e.title,
    'starts_at',e.starts_at,
    'ends_at',e.ends_at,
    'room_released',o.room_released_at is not null,
    'room_released_at',o.room_released_at,
    'pickup_released',o.pickup_released_at is not null,
    'pickup_released_at',o.pickup_released_at,
    'closed',o.closed_at is not null
  )
  into v_result
  from public.events e
  left join public.kids_event_operations o
    on o.event_id=e.id
   and o.organization_id=e.organization_id
  where e.id=p_event_id
    and e.organization_id=p_organization_id
    and e.unit_id=p_unit_id
    and e.status='published';

  return coalesce(v_result,'{}'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_active_kids_guardian_call(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  select jsonb_build_object(
    'call_id',gc.id,
    'checkin_id',gc.checkin_id,
    'requested_at',gc.requested_at,
    'child_name',coalesce(nullif(cp.preferred_name,''),cp.full_name),
    'room_name',kr.name
  )
  into v_result
  from public.kids_guardian_calls gc
  join public.people gp
    on gp.id=gc.guardian_person_id
   and gp.organization_id=gc.organization_id
   and gp.auth_user_id=auth.uid()
   and gp.record_status='active'
  join public.kids_checkins kc
    on kc.id=gc.checkin_id
   and kc.organization_id=gc.organization_id
  join public.people cp
    on cp.id=kc.child_person_id
   and cp.organization_id=kc.organization_id
  join public.kids_rooms kr
    on kr.id=kc.room_id
   and kr.organization_id=kc.organization_id
  where gc.organization_id=p_organization_id
    and gc.status='SENT'
  order by gc.requested_at desc
  limit 1;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_my_kid_pickup_qr(p_checkin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_checkin public.kids_checkins%rowtype;
  v_child public.people%rowtype;
  v_guardian public.kids_guardians%rowtype;
  v_room public.kids_rooms%rowtype;
  v_token text;
  v_pass_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_checkin
  from public.kids_checkins
  where id=p_checkin_id
    and status='ACTIVE'
  for update;

  if not found then
    raise exception 'Check-in Kids não está ativo';
  end if;

  if not exists(
    select 1
    from public.kids_event_operations o
    where o.organization_id=v_checkin.organization_id
      and o.event_id=v_checkin.event_id
      and o.pickup_released_at is not null
  ) then
    raise exception 'A retirada das crianças ainda não foi liberada';
  end if;

  select g.* into v_guardian
  from public.kids_guardians g
  join public.people gp
    on gp.id=g.guardian_person_id
   and gp.organization_id=g.organization_id
  where g.organization_id=v_checkin.organization_id
    and g.child_person_id=v_checkin.child_person_id
    and g.active=true
    and g.can_pickup=true
    and gp.auth_user_id=auth.uid()
    and gp.record_status='active'
  limit 1;

  if not found then
    raise exception 'Você não está autorizado a retirar esta criança'
      using errcode='42501';
  end if;

  select * into v_child
  from public.people
  where id=v_checkin.child_person_id
    and organization_id=v_checkin.organization_id;

  select * into v_room
  from public.kids_rooms
  where id=v_checkin.room_id
    and organization_id=v_checkin.organization_id;

  update public.qr_passes
  set revoked_at=now()
  where organization_id=v_checkin.organization_id
    and purpose='KIDS_PICKUP'
    and subject_id=v_checkin.id
    and holder_person_id=v_guardian.guardian_person_id
    and consumed_at is null
    and revoked_at is null;

  v_token:=lower(encode(extensions.gen_random_bytes(32),'hex'));
  v_expires_at:=now()+interval '90 seconds';

  insert into public.qr_passes(
    organization_id,purpose,subject_id,holder_person_id,
    token_hash,token_hint,expires_at,issued_by_user_id,metadata
  )
  values(
    v_checkin.organization_id,'KIDS_PICKUP',
    v_checkin.id,v_guardian.guardian_person_id,
    app_private.elo_qr_hash(v_token),
    substr(v_token,1,8),
    v_expires_at,
    auth.uid(),
    jsonb_build_object(
      'child_person_id',v_checkin.child_person_id,
      'event_id',v_checkin.event_id,
      'room_id',v_checkin.room_id
    )
  )
  returning id into v_pass_id;

  return jsonb_build_object(
    'ok',true,
    'pass_id',v_pass_id,
    'token','eloqr:v1:'||v_token,
    'expires_at',v_expires_at,
    'checkin_id',v_checkin.id,
    'child_name',v_child.full_name,
    'room_name',v_room.name
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_my_kid_room_entry_qr(p_checkin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_checkin public.kids_checkins%rowtype;
  v_guardian public.kids_guardians%rowtype;
  v_child public.people%rowtype;
  v_room public.kids_rooms%rowtype;
  v_token text;
  v_pass_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_checkin
  from public.kids_checkins
  where id=p_checkin_id
    and status='WAITING_ROOM'
  for update;

  if not found then
    raise exception 'A criança não está aguardando a liberação da sala';
  end if;

  if not exists(
    select 1
    from public.kids_event_operations o
    where o.organization_id=v_checkin.organization_id
      and o.event_id=v_checkin.event_id
      and o.room_released_at is not null
      and o.closed_at is null
  ) then
    raise exception 'A sala das crianças ainda não foi liberada';
  end if;

  select g.* into v_guardian
  from public.kids_guardians g
  join public.people gp
    on gp.id=g.guardian_person_id
   and gp.organization_id=g.organization_id
  where g.organization_id=v_checkin.organization_id
    and g.child_person_id=v_checkin.child_person_id
    and g.active=true
    and g.can_checkin=true
    and gp.auth_user_id=auth.uid()
    and gp.record_status='active'
  limit 1;

  if not found then
    raise exception 'Responsável não autorizado'
      using errcode='42501';
  end if;

  select * into v_child
  from public.people
  where id=v_checkin.child_person_id
    and organization_id=v_checkin.organization_id;

  select * into v_room
  from public.kids_rooms
  where id=v_checkin.room_id
    and organization_id=v_checkin.organization_id;

  update public.qr_passes
  set revoked_at=now()
  where organization_id=v_checkin.organization_id
    and purpose='KIDS_CHECKIN'
    and subject_id=v_checkin.child_person_id
    and holder_person_id=v_guardian.guardian_person_id
    and consumed_at is null
    and revoked_at is null;

  v_token:=lower(encode(extensions.gen_random_bytes(32),'hex'));
  v_expires_at:=now()+interval '120 seconds';

  insert into public.qr_passes(
    organization_id,purpose,subject_id,holder_person_id,
    token_hash,token_hint,expires_at,issued_by_user_id,metadata
  )
  values(
    v_checkin.organization_id,
    'KIDS_CHECKIN',
    v_checkin.child_person_id,
    v_guardian.guardian_person_id,
    app_private.elo_qr_hash(v_token),
    substr(v_token,1,8),
    v_expires_at,
    auth.uid(),
    jsonb_build_object(
      'event_id',v_checkin.event_id,
      'recommended_room_id',v_checkin.room_id,
      'waiting_checkin_id',v_checkin.id
    )
  )
  returning id into v_pass_id;

  return jsonb_build_object(
    'ok',true,
    'pass_id',v_pass_id,
    'token','eloqr:v1:'||v_token,
    'expires_at',v_expires_at,
    'checkin_id',v_checkin.id,
    'child_name',v_child.full_name,
    'recommended_room_name',v_room.name
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_kids_event_schedule(p_organization_id uuid, p_unit_id uuid, p_event_id uuid)
 RETURNS TABLE(assignment_id uuid, person_id uuid, person_name text, status text, role_label text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
begin
  if not app_private.can_lead_kids(
    p_organization_id,p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  return query
  select
    sa.id,
    p.id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    sa.status,
    sa.role_label
  from public.schedule_assignments sa
  join public.schedule_rules sr
    on sr.id=sa.rule_id
   and sr.organization_id=sa.organization_id
  join public.departments d
    on d.id=sr.department_id
   and d.organization_id=sr.organization_id
  join public.people p
    on p.id=sa.person_id
   and p.organization_id=sa.organization_id
  where sa.organization_id=p_organization_id
    and sa.event_id=p_event_id
    and d.unit_id=p_unit_id
    and d.system_key='kids'
    and sa.status<>'cancelled'
  order by
    case sa.status
      when 'confirmed' then 0
      when 'pending' then 1
      else 2
    end,
    p.full_name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_kids_people_candidates(p_organization_id uuid, p_unit_id uuid)
 RETURNS TABLE(person_id uuid, name text, email text, phone text, current_staff_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
begin
  if not app_private.can_lead_kids(
    p_organization_id,p_unit_id
  )
  and not app_private.has_permission(
    p_organization_id,'kids.manage',p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    p.email,
    p.phone,
    ksm.staff_role
  from public.people p
  join public.unit_memberships um
    on um.person_id=p.id
   and um.organization_id=p.organization_id
   and um.unit_id=p_unit_id
   and um.status='active'
  left join public.kids_staff_members ksm
    on ksm.organization_id=p.organization_id
   and ksm.unit_id=p_unit_id
   and ksm.person_id=p.id
   and ksm.active=true
  where p.organization_id=p_organization_id
    and p.record_status='active'
    and extract(year from age(
      current_date,coalesce(p.birth_date,current_date-interval '18 years')
    ))>=10
  order by
    case when ksm.staff_role='LEADER' then 0
         when ksm.staff_role='VOLUNTEER' then 1
         else 2 end,
    p.full_name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_kids_staff(p_organization_id uuid, p_unit_id uuid)
 RETURNS TABLE(staff_id uuid, person_id uuid, name text, staff_role text, phone text, active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
begin
  if not app_private.can_lead_kids(
    p_organization_id,p_unit_id
  )
  and not app_private.has_permission(
    p_organization_id,'kids.manage',p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  return query
  select
    k.id,
    p.id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    k.staff_role,
    p.phone,
    k.active
  from public.kids_staff_members k
  join public.people p
    on p.id=k.person_id
   and p.organization_id=k.organization_id
  where k.organization_id=p_organization_id
    and k.unit_id=p_unit_id
    and k.active=true
    and p.record_status='active'
  order by
    case when k.staff_role='LEADER' then 0 else 1 end,
    p.full_name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_kids(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_guardian_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_elo_igreja(p_organization_id) then
    return '[]'::jsonb;
  end if;

  select id into v_guardian_id
  from public.people
  where organization_id=p_organization_id
    and auth_user_id=auth.uid()
    and record_status='active'
  limit 1;

  if v_guardian_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(item order by item->>'name'),
    '[]'::jsonb
  )
  into v_result
  from (
    select jsonb_build_object(
      'child_person_id',c.child_person_id,
      'name',p.full_name,
      'preferred_name',p.preferred_name,
      'birth_date',p.birth_date,
      'relationship',g.relationship,
      'can_checkin',g.can_checkin,
      'can_pickup',g.can_pickup,
      'default_room_id',c.default_room_id,
      'default_room_name',dr.name,
      'allergies',h.allergies,
      'medical_notes',h.medical_notes,
      'emergency_notes',h.emergency_notes,
      'active_checkin',
        case when kc.id is null then null else jsonb_build_object(
          'checkin_id',kc.id,
          'event_id',kc.event_id,
          'room_id',kc.room_id,
          'room_name',kr.name,
          'checked_in_at',kc.checked_in_at,
          'status',kc.status,
          'room_released',op.room_released_at is not null,
          'pickup_released',op.pickup_released_at is not null
        ) end,
      'guardian_call',
        case when call.id is null then null else jsonb_build_object(
          'call_id',call.id,
          'status',call.status,
          'requested_at',call.requested_at
        ) end
    ) as item
    from public.kids_guardians g
    join public.kids_children c
      on c.child_person_id=g.child_person_id
     and c.organization_id=g.organization_id
    join public.people p
      on p.id=c.child_person_id
     and p.organization_id=c.organization_id
    left join public.kids_rooms dr
      on dr.id=c.default_room_id
     and dr.organization_id=c.organization_id
    left join app_private.kids_child_health h
      on h.child_person_id=c.child_person_id
     and h.organization_id=c.organization_id
    left join lateral (
      select x.*
      from public.kids_checkins x
      where x.organization_id=c.organization_id
        and x.child_person_id=c.child_person_id
        and x.status in ('WAITING_ROOM','ACTIVE')
      order by x.checked_in_at desc
      limit 1
    ) kc on true
    left join public.kids_rooms kr
      on kr.id=kc.room_id
     and kr.organization_id=kc.organization_id
    left join public.kids_event_operations op
      on op.event_id=kc.event_id
     and op.organization_id=kc.organization_id
    left join lateral (
      select gc.*
      from public.kids_guardian_calls gc
      where gc.organization_id=c.organization_id
        and gc.checkin_id=kc.id
        and gc.guardian_person_id=v_guardian_id
        and gc.status in ('SENT','ACKNOWLEDGED')
      order by gc.requested_at desc
      limit 1
    ) call on true
    where g.organization_id=p_organization_id
      and g.guardian_person_id=v_guardian_id
      and g.active=true
      and c.active=true
      and p.record_status='active'
  ) q;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_kid_checkin_qr(p_payload text, p_room_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_token text;
  v_pass public.qr_passes%rowtype;
  v_child public.people%rowtype;
  v_guardian public.kids_guardians%rowtype;
  v_event public.events%rowtype;
  v_room public.kids_rooms%rowtype;
  v_checkin public.kids_checkins%rowtype;
  v_age_months integer;
  v_occupancy integer;
  v_staff integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  v_token:=app_private.normalize_elo_qr_token(p_payload);

  if length(v_token)<>64 or v_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','QR inválido.');
  end if;

  select * into v_pass
  from public.qr_passes
  where token_hash=app_private.elo_qr_hash(v_token)
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','QR inválido ou expirado.');
  end if;
  if v_pass.purpose<>'KIDS_CHECKIN' then
    return jsonb_build_object('ok',false,'error','Este QR pertence a outra operação.');
  end if;
  if v_pass.revoked_at is not null then
    return jsonb_build_object('ok',false,'error','Este QR foi substituído por um mais recente.');
  end if;
  if v_pass.consumed_at is not null then
    return jsonb_build_object('ok',false,'error','Este QR já foi utilizado.');
  end if;
  if v_pass.expires_at<=now() then
    return jsonb_build_object('ok',false,'error','Este QR expirou. Gere outro.');
  end if;

  select p.* into v_child
  from public.people p
  join public.kids_children c
    on c.child_person_id=p.id
   and c.organization_id=p.organization_id
  where p.id=v_pass.subject_id
    and p.organization_id=v_pass.organization_id
    and p.record_status='active'
    and c.active=true;

  if not found then
    return jsonb_build_object('ok',false,'error','Criança indisponível.');
  end if;

  select * into v_guardian
  from public.kids_guardians
  where organization_id=v_pass.organization_id
    and child_person_id=v_child.id
    and guardian_person_id=v_pass.holder_person_id
    and active=true
    and can_checkin=true;

  if not found then
    return jsonb_build_object('ok',false,'error','Responsável não autorizado para check-in.');
  end if;

  select * into v_event
  from public.events
  where id=(v_pass.metadata->>'event_id')::uuid
    and organization_id=v_pass.organization_id
    and status='published';

  if not found then
    return jsonb_build_object('ok',false,'error','Culto ou evento indisponível.');
  end if;

  if not app_private.can_manage_kids(
    v_pass.organization_id,v_event.unit_id
  ) then
    return jsonb_build_object(
      'ok',false,
      'error','Você não pertence à equipe autorizada do Elo Kids.'
    );
  end if;

  if not exists(
    select 1
    from public.kids_event_operations o
    where o.organization_id=v_pass.organization_id
      and o.event_id=v_event.id
      and o.room_released_at is not null
      and o.closed_at is null
  ) then
    return jsonb_build_object(
      'ok',false,
      'error','A sala das crianças ainda não foi liberada.'
    );
  end if;

  v_age_months:=
    extract(year from age(current_date,v_child.birth_date))::int*12+
    extract(month from age(current_date,v_child.birth_date))::int;

  select * into v_checkin
  from public.kids_checkins
  where organization_id=v_pass.organization_id
    and event_id=v_event.id
    and child_person_id=v_child.id
    and status in ('WAITING_ROOM','ACTIVE')
  limit 1
  for update;

  if v_checkin.status='ACTIVE' then
    update public.qr_passes
    set consumed_at=now(),consumed_by_user_id=auth.uid()
    where id=v_pass.id;

    return jsonb_build_object(
      'ok',true,
      'already_checked_in',true,
      'checkin_id',v_checkin.id,
      'child_name',v_child.full_name,
      'room_id',v_checkin.room_id
    );
  end if;

  if p_room_id is not null then
    select * into v_room
    from public.kids_rooms
    where id=p_room_id
      and organization_id=v_pass.organization_id
      and unit_id=v_event.unit_id
      and active=true;
  else
    select * into v_room
    from public.kids_rooms r
    where r.id=coalesce(
      nullif(v_pass.metadata->>'recommended_room_id','')::uuid,
      v_checkin.room_id
    )
      and r.organization_id=v_pass.organization_id
      and r.unit_id=v_event.unit_id
      and r.active=true;
  end if;

  if not found
     or v_age_months not between v_room.min_age_months and v_room.max_age_months
  then
    return jsonb_build_object(
      'ok',false,
      'error','Sala incompatível com a faixa etária.'
    );
  end if;

  select count(*)::int into v_occupancy
  from public.kids_checkins
  where room_id=v_room.id
    and event_id=v_event.id
    and status='ACTIVE';

  if v_occupancy>=v_room.capacity then
    return jsonb_build_object('ok',false,'error','Sala lotada.');
  end if;

  select count(*)::int into v_staff
  from public.kids_staff_room_presence
  where room_id=v_room.id
    and event_id=v_event.id
    and checked_out_at is null;

  if v_staff<v_room.min_staff then
    return jsonb_build_object(
      'ok',false,
      'error','Equipe mínima da sala ainda não está presente.',
      'staff_present',v_staff,
      'min_staff',v_room.min_staff
    );
  end if;

  update public.kids_checkins
  set status='ACTIVE',
      room_id=v_room.id,
      updated_at=now()
  where id=v_checkin.id
  returning * into v_checkin;

  update public.qr_passes
  set consumed_at=now(),
      consumed_by_user_id=auth.uid()
  where id=v_pass.id;

  insert into public.qr_validations(
    organization_id,qr_pass_id,purpose,subject_id,holder_person_id,
    operator_user_id,status,reason,kids_checkin_id
  )
  values(
    v_pass.organization_id,v_pass.id,v_pass.purpose,
    v_pass.subject_id,v_pass.holder_person_id,
    auth.uid(),'ACCEPTED','OK',v_checkin.id
  );

  perform app_private.write_audit(
    v_pass.organization_id,v_event.unit_id,
    'kids.room_entry','kids_checkins',v_checkin.id,
    jsonb_build_object(
      'child_person_id',v_child.id,
      'room_id',v_room.id,
      'event_id',v_event.id
    )
  );

  return jsonb_build_object(
    'ok',true,
    'checkin_id',v_checkin.id,
    'child_name',v_child.full_name,
    'room_id',v_room.id,
    'room_name',v_room.name,
    'checked_in_at',v_checkin.checked_in_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_my_child(p_organization_id uuid, p_unit_id uuid, p_full_name text, p_birth_date date, p_relationship text DEFAULT 'Responsável'::text, p_allergies text DEFAULT NULL::text, p_medical_notes text DEFAULT NULL::text, p_emergency_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_guardian_id uuid;
  v_child_id uuid;
  v_room_id uuid;
  v_age_months integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_elo_igreja(p_organization_id) then
    raise exception 'Elo Kids requer o plano Elo Igreja';
  end if;

  if not app_private.has_permission(
    p_organization_id,'kids.parent',p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if p_full_name is null or length(trim(p_full_name))<2 then
    raise exception 'Nome da criança é obrigatório';
  end if;

  if p_birth_date is null
     or p_birth_date>current_date
     or p_birth_date<=current_date-interval '10 years'
  then
    raise exception 'O Elo Kids aceita crianças menores de 10 anos';
  end if;

  select p.id into v_guardian_id
  from public.people p
  join public.organization_memberships om
    on om.person_id=p.id
   and om.organization_id=p.organization_id
  join public.unit_memberships um
    on um.person_id=p.id
   and um.organization_id=p.organization_id
  where p.organization_id=p_organization_id
    and p.auth_user_id=auth.uid()
    and p.record_status='active'
    and om.status='active'
    and um.unit_id=p_unit_id
    and um.status='active'
  limit 1;

  if v_guardian_id is null then
    raise exception 'Seu cadastro não está ativo nesta unidade';
  end if;

  v_age_months:=
    extract(year from age(current_date,p_birth_date))::int*12+
    extract(month from age(current_date,p_birth_date))::int;

  select kr.id into v_room_id
  from public.kids_rooms kr
  where kr.organization_id=p_organization_id
    and kr.unit_id=p_unit_id
    and kr.active=true
    and v_age_months between kr.min_age_months and kr.max_age_months
  order by kr.min_age_months desc,kr.capacity,kr.created_at
  limit 1;

  insert into public.people(
    organization_id,full_name,birth_date,record_status,created_by
  )
  values(
    p_organization_id,trim(p_full_name),p_birth_date,'active',auth.uid()
  )
  returning id into v_child_id;

  insert into public.organization_memberships(
    organization_id,person_id,membership_type,status,started_at
  )
  values(
    p_organization_id,v_child_id,'congregant','active',current_date
  );

  insert into public.unit_memberships(
    organization_id,unit_id,person_id,relationship_type,status,started_at
  )
  values(
    p_organization_id,p_unit_id,v_child_id,'attendee','active',current_date
  );

  insert into public.kids_children(
    child_person_id,organization_id,default_room_id,active,created_by
  )
  values(
    v_child_id,p_organization_id,v_room_id,true,auth.uid()
  );

  insert into public.kids_guardians(
    organization_id,child_person_id,guardian_person_id,
    relationship,is_primary,can_checkin,can_pickup,active,created_by
  )
  values(
    p_organization_id,v_child_id,v_guardian_id,
    coalesce(nullif(trim(p_relationship),''),'Responsável'),
    true,true,true,true,auth.uid()
  );

  insert into app_private.kids_child_health(
    child_person_id,organization_id,allergies,
    medical_notes,emergency_notes,updated_by_user_id
  )
  values(
    v_child_id,p_organization_id,
    nullif(trim(p_allergies),''),
    nullif(trim(p_medical_notes),''),
    nullif(trim(p_emergency_notes),''),
    auth.uid()
  );

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    'kids.child_registered','kids_children',v_child_id,
    jsonb_build_object(
      'guardian_person_id',v_guardian_id,
      'default_room_id',v_room_id
    )
  );

  return jsonb_build_object(
    'ok',true,
    'child_person_id',v_child_id,
    'default_room_id',v_room_id,
    'name',trim(p_full_name)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_kids_pickup(p_organization_id uuid, p_unit_id uuid, p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_notified integer:=0;
begin
  if not app_private.can_lead_kids(
    p_organization_id,p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  insert into public.kids_event_operations(
    event_id,organization_id,unit_id,
    room_released_at,room_released_by,
    pickup_released_at,pickup_released_by
  )
  values(
    p_event_id,p_organization_id,p_unit_id,
    now(),auth.uid(),
    now(),auth.uid()
  )
  on conflict(event_id)
  do update set
    pickup_released_at=coalesce(
      public.kids_event_operations.pickup_released_at,now()
    ),
    pickup_released_by=coalesce(
      public.kids_event_operations.pickup_released_by,auth.uid()
    ),
    updated_at=now();

  v_notified:=app_private.notify_kids_guardians_for_event(
    p_organization_id,p_event_id,'PICKUP_OPEN'
  );

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    'kids.pickup_released','kids_event_operations',p_event_id,
    jsonb_build_object('notified_guardians',v_notified)
  );

  return jsonb_build_object(
    'ok',true,
    'notified_guardians',v_notified
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_kids_room(p_organization_id uuid, p_unit_id uuid, p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_notified integer:=0;
begin
  if not app_private.can_lead_kids(
    p_organization_id,p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.events e
    where e.id=p_event_id
      and e.organization_id=p_organization_id
      and e.unit_id=p_unit_id
      and e.status='published'
  ) then
    raise exception 'Culto indisponível';
  end if;

  insert into public.kids_event_operations(
    event_id,organization_id,unit_id,
    room_released_at,room_released_by
  )
  values(
    p_event_id,p_organization_id,p_unit_id,
    now(),auth.uid()
  )
  on conflict(event_id)
  do update set
    room_released_at=coalesce(
      public.kids_event_operations.room_released_at,now()
    ),
    room_released_by=coalesce(
      public.kids_event_operations.room_released_by,auth.uid()
    ),
    closed_at=null,
    closed_by=null,
    updated_at=now();

  v_notified:=app_private.notify_kids_guardians_for_event(
    p_organization_id,p_event_id,'ROOM_OPEN'
  );

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    'kids.room_released','kids_event_operations',p_event_id,
    jsonb_build_object('notified_guardians',v_notified)
  );

  return jsonb_build_object(
    'ok',true,
    'notified_guardians',v_notified
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_kids_staff_member(p_organization_id uuid, p_unit_id uuid, p_person_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_role text;
begin
  if not app_private.can_lead_kids(
    p_organization_id,p_unit_id
  )
  and not app_private.has_permission(
    p_organization_id,'kids.manage',p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select staff_role into v_role
  from public.kids_staff_members
  where organization_id=p_organization_id
    and unit_id=p_unit_id
    and person_id=p_person_id
    and active=true;

  if v_role='LEADER'
     and not app_private.has_permission(
       p_organization_id,'kids.manage',p_unit_id
     )
  then
    raise exception 'Somente a administração pode remover a liderança'
      using errcode='42501';
  end if;

  update public.kids_staff_members
  set active=false,
      updated_at=now()
  where organization_id=p_organization_id
    and unit_id=p_unit_id
    and person_id=p_person_id
    and active=true;

  if not found then
    return false;
  end if;

  perform app_private.sync_kids_staff_to_department(
    p_organization_id,p_unit_id,p_person_id,false,false
  );

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_kids_event_schedule(p_organization_id uuid, p_unit_id uuid, p_event_id uuid, p_required_count integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'app_private', 'pg_temp'
AS $function$
declare
  v_department_id uuid;
  v_function_id uuid;
  v_required integer;
  v_rule_id uuid;
  v_horizon integer;
begin
  if not app_private.can_lead_kids(
    p_organization_id,p_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.events e
    where e.id=p_event_id
      and e.organization_id=p_organization_id
      and e.unit_id=p_unit_id
      and e.status='published'
      and e.starts_at>=now()-interval '6 hours'
  ) then
    raise exception 'Culto indisponível para escala';
  end if;

  select x.department_id,x.function_id
  into v_department_id,v_function_id
  from app_private.ensure_kids_department(
    p_organization_id,p_unit_id
  ) x;

  select greatest(
    1,
    coalesce(
      p_required_count,
      sum(r.min_staff),
      2
    )::integer
  )
  into v_required
  from public.kids_rooms r
  where r.organization_id=p_organization_id
    and r.unit_id=p_unit_id
    and r.active=true;

  v_required:=least(v_required,50);

  select greatest(
    7,
    least(
      180,
      ceil(
        greatest(
          0,
          extract(epoch from (
            (select starts_at from public.events where id=p_event_id)-now()
          ))/86400.0
        )
      )::integer+1
    )
  )
  into v_horizon;

  select sr.id into v_rule_id
  from public.schedule_rules sr
  where sr.organization_id=p_organization_id
    and sr.department_id=v_department_id
    and sr.event_id=p_event_id
    and sr.department_function_id=v_function_id
    and sr.active=true
  limit 1;

  if v_rule_id is null then
    insert into public.schedule_rules(
      organization_id,department_id,routine_id,event_id,
      department_function_id,role_label,required_count,
      rotation_mode,min_rest_days,horizon_days,active,created_by
    )
    values(
      p_organization_id,v_department_id,null,p_event_id,
      v_function_id,'Equipe Elo Kids',v_required,
      'balanced',0,v_horizon,true,auth.uid()
    )
    returning id into v_rule_id;
  else
    update public.schedule_rules
    set required_count=v_required,
        horizon_days=v_horizon,
        active=true,
        updated_at=now()
    where id=v_rule_id;
  end if;

  perform app_private.generate_schedules(
    p_organization_id,v_horizon
  );

  return jsonb_build_object(
    'ok',true,
    'rule_id',v_rule_id,
    'required_count',v_required,
    'event_id',p_event_id
  );
end;
$function$;


revoke all on function public.list_kids_people_candidates(uuid,uuid) from public,anon;
grant execute on function public.list_kids_people_candidates(uuid,uuid) to authenticated;

revoke all on function public.list_kids_staff(uuid,uuid) from public,anon;
grant execute on function public.list_kids_staff(uuid,uuid) to authenticated;

revoke all on function public.remove_kids_staff_member(uuid,uuid,uuid) from public,anon;
grant execute on function public.remove_kids_staff_member(uuid,uuid,uuid) to authenticated;

revoke all on function public.save_kids_event_schedule(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.save_kids_event_schedule(uuid,uuid,uuid,integer) to authenticated;

revoke all on function public.list_kids_event_schedule(uuid,uuid,uuid) from public,anon;
grant execute on function public.list_kids_event_schedule(uuid,uuid,uuid) to authenticated;

revoke all on function public.checkin_my_child_arrival(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.checkin_my_child_arrival(uuid,uuid,uuid,uuid) to authenticated;

revoke all on function public.issue_my_kid_room_entry_qr(uuid) from public,anon;
grant execute on function public.issue_my_kid_room_entry_qr(uuid) to authenticated;

revoke all on function public.get_kids_event_operation(uuid,uuid,uuid) from public,anon;
grant execute on function public.get_kids_event_operation(uuid,uuid,uuid) to authenticated;

revoke all on function public.release_kids_room(uuid,uuid,uuid) from public,anon;
grant execute on function public.release_kids_room(uuid,uuid,uuid) to authenticated;

revoke all on function public.release_kids_pickup(uuid,uuid,uuid) from public,anon;
grant execute on function public.release_kids_pickup(uuid,uuid,uuid) to authenticated;

revoke all on function public.get_my_active_kids_guardian_call(uuid) from public,anon;
grant execute on function public.get_my_active_kids_guardian_call(uuid) to authenticated;

notify pgrst,'reload schema';
