
-- ELO v34
-- Escalas passam a existir por ocorrência/data, nunca por rotina recorrente.

create or replace function app_private.is_department_leader(
  p_department_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select exists (
    select 1
    from public.departments d
    join public.people p
      on p.id=d.leader_person_id
     and p.organization_id=d.organization_id
    where d.id=p_department_id
      and d.organization_id=p_organization_id
      and d.active=true
      and p.auth_user_id=auth.uid()
      and p.record_status='active'
  );
$function$;

revoke all on function app_private.is_department_leader(uuid,uuid)
from public,anon;
grant execute on function app_private.is_department_leader(uuid,uuid)
to authenticated;

update public.schedule_rules
set active=false,
    updated_at=now()
where active=true
  and routine_id is not null;

update public.schedule_assignments sa
set status='cancelled',
    updated_at=now()
from public.schedule_rules sr,
     public.events e
where sa.rule_id=sr.id
  and sa.organization_id=sr.organization_id
  and e.id=sa.event_id
  and e.organization_id=sa.organization_id
  and sr.routine_id is not null
  and e.starts_at>=now()
  and sa.source='auto'
  and sa.locked_manual=false
  and sa.status in ('pending','confirmed','replacement_requested');

update app_private.schedule_notification_outbox o
set processed_at=coalesce(o.processed_at,now())
where o.processed_at is null
  and nullif(o.payload->>'assignment_id','') is not null
  and exists (
    select 1
    from public.schedule_assignments sa
    join public.schedule_rules sr
      on sr.id=sa.rule_id
     and sr.organization_id=sa.organization_id
    join public.events e
      on e.id=sa.event_id
     and e.organization_id=sa.organization_id
    where sa.id=(o.payload->>'assignment_id')::uuid
      and sa.organization_id=o.organization_id
      and sr.routine_id is not null
      and e.starts_at>=now()
      and sa.status='cancelled'
  );

update app_private.notification_outbox o
set processed_at=coalesce(o.processed_at,now())
where o.processed_at is null
  and o.category='schedule'
  and nullif(o.data #>> '{payload,assignment_id}','') is not null
  and exists (
    select 1
    from public.schedule_assignments sa
    join public.schedule_rules sr
      on sr.id=sa.rule_id
     and sr.organization_id=sa.organization_id
    join public.events e
      on e.id=sa.event_id
     and e.organization_id=sa.organization_id
    where sa.id=(o.data #>> '{payload,assignment_id}')::uuid
      and sa.organization_id=o.organization_id
      and sr.routine_id is not null
      and e.starts_at>=now()
      and sa.status='cancelled'
  );

update public.notifications n
set archived_at=coalesce(n.archived_at,now()),
    read_at=coalesce(n.read_at,now())
where n.category='schedule'
  and nullif(n.data #>> '{payload,assignment_id}','') is not null
  and exists (
    select 1
    from public.schedule_assignments sa
    join public.schedule_rules sr
      on sr.id=sa.rule_id
     and sr.organization_id=sa.organization_id
    join public.events e
      on e.id=sa.event_id
     and e.organization_id=sa.organization_id
    where sa.id=(n.data #>> '{payload,assignment_id}')::uuid
      and sa.organization_id=n.organization_id
      and sr.routine_id is not null
      and e.starts_at>=now()
      and sa.status='cancelled'
  );

create or replace function app_private.guard_schedule_rule_scope()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
declare
  v_department_unit uuid;
  v_target_unit uuid;
begin
  select d.unit_id into v_department_unit
  from public.departments d
  where d.id=new.department_id
    and d.organization_id=new.organization_id;

  if v_department_unit is null then
    raise exception 'Department not found';
  end if;

  if new.routine_id is not null then
    if new.active then
      raise exception 'Recurring schedule rules are disabled. Create the schedule for a specific service date.';
    end if;

    select r.unit_id into v_target_unit
    from public.service_routines r
    where r.id=new.routine_id
      and r.organization_id=new.organization_id;
  else
    select e.unit_id into v_target_unit
    from public.events e
    where e.id=new.event_id
      and e.organization_id=new.organization_id;
  end if;

  if v_target_unit is null then
    raise exception 'Schedule target not found';
  end if;

  if v_department_unit<>v_target_unit then
    raise exception 'Department and schedule target must belong to the same unit';
  end if;

  return new;
end;
$function$;

create or replace function public.save_schedule_rule(
  p_organization_id uuid,
  p_department_id uuid,
  p_routine_id uuid,
  p_role_label text,
  p_required_count integer default 1,
  p_rotation_mode text default 'balanced',
  p_min_rest_days integer default 0,
  p_horizon_days integer default 60
)
returns public.schedule_rules
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
begin
  raise exception 'Escalas recorrentes foram desativadas. Abra a data específica do culto e crie a escala daquela ocorrência.';
end;
$function$;

create or replace function public.save_event_schedule_rule(
  p_organization_id uuid,
  p_department_id uuid,
  p_event_id uuid,
  p_role_label text,
  p_required_count integer default 1,
  p_rotation_mode text default 'balanced',
  p_min_rest_days integer default 0
)
returns public.schedule_rules
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_department public.departments%rowtype;
  v_event public.events%rowtype;
  v_result public.schedule_rules%rowtype;
  v_role text:=trim(coalesce(p_role_label,''));
  v_required integer:=greatest(1,least(coalesce(p_required_count,1),50));
  v_rest integer:=greatest(0,least(coalesce(p_min_rest_days,0),90));
  v_rotation text:=lower(coalesce(p_rotation_mode,'balanced'));
  v_horizon integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_department
  from public.departments
  where id=p_department_id
    and organization_id=p_organization_id
    and active=true;

  if not found then
    raise exception 'Department not found';
  end if;

  select * into v_event
  from public.events
  where id=p_event_id
    and organization_id=p_organization_id
    and status='published';

  if not found then
    raise exception 'Service occurrence not found';
  end if;

  if v_event.starts_at < now()-interval '2 hours' then
    raise exception 'Cannot create a schedule for a service that has already passed';
  end if;

  if v_department.unit_id<>v_event.unit_id then
    raise exception 'Department and service must belong to the same unit';
  end if;

  if not app_private.has_permission(
    p_organization_id,
    'schedules.manage',
    v_department.unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if length(v_role)<2 then
    raise exception 'Role label required';
  end if;

  if v_rotation not in ('balanced','fixed') then
    raise exception 'Invalid rotation mode';
  end if;

  v_horizon:=greatest(
    7,
    least(
      180,
      ceil(
        greatest(
          0,
          extract(epoch from (v_event.starts_at-now())) / 86400.0
        )
      )::integer + 1
    )
  );

  select * into v_result
  from public.schedule_rules
  where organization_id=p_organization_id
    and department_id=p_department_id
    and event_id=p_event_id
    and routine_id is null
    and lower(role_label)=lower(v_role)
    and active=true
  limit 1
  for update;

  if found then
    update public.schedule_rules
    set required_count=v_required,
        rotation_mode=v_rotation,
        min_rest_days=v_rest,
        horizon_days=v_horizon,
        updated_at=now()
    where id=v_result.id
    returning * into v_result;
  else
    insert into public.schedule_rules(
      organization_id,
      department_id,
      routine_id,
      event_id,
      role_label,
      required_count,
      rotation_mode,
      min_rest_days,
      horizon_days,
      active,
      created_by
    )
    values(
      p_organization_id,
      p_department_id,
      null,
      p_event_id,
      v_role,
      v_required,
      v_rotation,
      v_rest,
      v_horizon,
      true,
      auth.uid()
    )
    returning * into v_result;
  end if;

  perform app_private.write_audit(
    p_organization_id,
    v_event.unit_id,
    'schedule.event_rule_saved',
    'schedule_rules',
    v_result.id,
    jsonb_build_object(
      'department_id',p_department_id,
      'event_id',p_event_id,
      'role_label',v_role,
      'required_count',v_required,
      'rotation_mode',v_rotation
    )
  );

  return v_result;
end;
$function$;

revoke all on function public.save_event_schedule_rule(
  uuid,uuid,uuid,text,integer,text,integer
) from public,anon;
grant execute on function public.save_event_schedule_rule(
  uuid,uuid,uuid,text,integer,text,integer
) to authenticated;

create or replace function public.remove_event_schedule_rule(
  p_organization_id uuid,
  p_rule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_rule public.schedule_rules%rowtype;
  v_unit_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_rule
  from public.schedule_rules
  where id=p_rule_id
    and organization_id=p_organization_id
    and event_id is not null;

  if not found then
    raise exception 'Schedule rule not found';
  end if;

  select d.unit_id into v_unit_id
  from public.departments d
  where d.id=v_rule.department_id
    and d.organization_id=v_rule.organization_id;

  if v_unit_id is null then
    raise exception 'Department not found';
  end if;

  if not app_private.has_permission(
    p_organization_id,
    'schedules.manage',
    v_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  update public.schedule_rules
  set active=false,
      updated_at=now()
  where id=v_rule.id;

  update public.schedule_assignments
  set status='cancelled',
      updated_at=now()
  where organization_id=p_organization_id
    and rule_id=v_rule.id
    and source='auto'
    and locked_manual=false
    and status in ('pending','confirmed','replacement_requested');

  perform app_private.write_audit(
    p_organization_id,
    v_unit_id,
    'schedule.event_rule_removed',
    'schedule_rules',
    v_rule.id,
    jsonb_build_object('event_id',v_rule.event_id)
  );

  return true;
end;
$function$;

revoke all on function public.remove_event_schedule_rule(uuid,uuid)
from public,anon;
grant execute on function public.remove_event_schedule_rule(uuid,uuid)
to authenticated;

create or replace function public.list_event_schedule(
  p_organization_id uuid,
  p_event_id uuid
)
returns table(
  assignment_id uuid,
  rule_id uuid,
  department_id uuid,
  department_name text,
  person_id uuid,
  person_name text,
  role_label text,
  status text,
  source text,
  starts_at timestamptz,
  ends_at timestamptz,
  event_title text
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    sa.id,
    sa.rule_id,
    sa.department_id,
    d.name,
    sa.person_id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    sa.role_label,
    sa.status,
    sa.source,
    e.starts_at,
    e.ends_at,
    e.title
  from public.schedule_assignments sa
  join public.departments d
    on d.id=sa.department_id
   and d.organization_id=sa.organization_id
  join public.people p
    on p.id=sa.person_id
   and p.organization_id=sa.organization_id
  join public.events e
    on e.id=sa.event_id
   and e.organization_id=sa.organization_id
  where sa.organization_id=p_organization_id
    and sa.event_id=p_event_id
    and sa.status<>'cancelled'
    and (
      app_private.has_permission(
        p_organization_id,
        'schedules.manage',
        d.unit_id
      )
      or app_private.is_department_leader(
        d.id,
        p_organization_id
      )
    )
  order by d.name,sa.role_label,p.full_name;
$function$;

revoke all on function public.list_event_schedule(uuid,uuid)
from public,anon;
grant execute on function public.list_event_schedule(uuid,uuid)
to authenticated;

create or replace function public.list_my_led_department_schedule(
  p_organization_id uuid
)
returns table(
  assignment_id uuid,
  department_id uuid,
  department_name text,
  event_id uuid,
  event_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  person_id uuid,
  person_name text,
  role_label text,
  status text
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    sa.id,
    d.id,
    d.name,
    e.id,
    e.title,
    e.starts_at,
    e.ends_at,
    p.id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    sa.role_label,
    sa.status
  from public.departments d
  join public.people leader
    on leader.id=d.leader_person_id
   and leader.organization_id=d.organization_id
  join public.schedule_assignments sa
    on sa.department_id=d.id
   and sa.organization_id=d.organization_id
  join public.events e
    on e.id=sa.event_id
   and e.organization_id=sa.organization_id
  join public.people p
    on p.id=sa.person_id
   and p.organization_id=sa.organization_id
  where d.organization_id=p_organization_id
    and d.active=true
    and leader.auth_user_id=auth.uid()
    and e.status='published'
    and e.starts_at>=now()-interval '2 hours'
    and e.starts_at<=now()+interval '90 days'
    and sa.status<>'cancelled'
  order by e.starts_at,d.name,sa.role_label,p.full_name;
$function$;

revoke all on function public.list_my_led_department_schedule(uuid)
from public,anon;
grant execute on function public.list_my_led_department_schedule(uuid)
to authenticated;

create or replace function app_private.bridge_domain_notice()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_category text;
  v_title text;
  v_body text;
  v_event_title text;
  v_event_when text;
  v_event_id uuid;
begin
  if new.auth_user_id is null then
    return new;
  end if;

  if tg_table_name = 'schedule_notification_outbox' then
    v_category := 'schedule';

    if new.payload ? 'event_id' then
      v_event_id:=nullif(new.payload->>'event_id','')::uuid;
    end if;

    if v_event_id is not null then
      select
        e.title,
        to_char(
          e.starts_at at time zone coalesce(u.timezone,'America/Sao_Paulo'),
          'DD/MM/YYYY "às" HH24:MI'
        )
      into v_event_title,v_event_when
      from public.events e
      join public.units u
        on u.id=e.unit_id
       and u.organization_id=e.organization_id
      where e.id=v_event_id
        and e.organization_id=new.organization_id;
    elsif new.payload ? 'event_title' then
      v_event_title:=nullif(new.payload->>'event_title','');
      if new.payload ? 'starts_at' then
        v_event_when:=to_char(
          (new.payload->>'starts_at')::timestamptz at time zone 'America/Sao_Paulo',
          'DD/MM/YYYY "às" HH24:MI'
        );
      end if;
    end if;

    v_title := case new.event_type
      when 'schedule.assigned' then 'Nova escala'
      when 'schedule.confirmed' then 'Escala confirmada'
      when 'schedule.substitution_invite' then 'Pedido de substituição'
      when 'schedule.substitution_completed' then 'Substituição concluída'
      when 'schedule.substitution_accepted' then 'Você assumiu uma escala'
      when 'schedule.declined' then 'Escala recusada'
      else 'Atualização de escala'
    end;

    v_body := case new.event_type
      when 'schedule.assigned' then
        'Você foi escalado' ||
        coalesce(' para '||v_event_title,'') ||
        coalesce(' em '||v_event_when,'') ||
        coalesce(' como '||nullif(new.payload->>'role_label',''),'') || '.'
      when 'schedule.confirmed' then
        'Sua confirmação de escala' ||
        coalesce(' para '||v_event_title,'') ||
        coalesce(' em '||v_event_when,'') ||
        ' foi registrada.'
      when 'schedule.substitution_invite' then
        'Há uma solicitação de substituição' ||
        coalesce(' para '||v_event_title,'') ||
        coalesce(' em '||v_event_when,'') || '.'
      when 'schedule.substitution_completed' then
        'Sua substituição' ||
        coalesce(' em '||v_event_when,'') ||
        ' foi concluída.'
      when 'schedule.substitution_accepted' then
        'Você assumiu a escala' ||
        coalesce(' de '||v_event_title,'') ||
        coalesce(' em '||v_event_when,'') || '.'
      when 'schedule.declined' then
        'Uma escala' ||
        coalesce(' de '||v_event_title,'') ||
        coalesce(' em '||v_event_when,'') ||
        ' foi recusada e precisa de atenção.'
      else
        'Há uma nova atualização em suas escalas' ||
        coalesce(' para '||v_event_when,'') || '.'
    end;
  else
    v_category := 'event';

    if new.payload ? 'event_id' then
      select e.title into v_event_title
      from public.events e
      where e.id = nullif(new.payload->>'event_id','')::uuid
        and e.organization_id = new.organization_id;
    end if;

    v_title := case new.event_type
      when 'event.registration_confirmed' then 'Inscrição confirmada'
      when 'event.waitlist_joined' then 'Você entrou na lista de espera'
      when 'event.waitlist_promoted' then 'Vaga liberada'
      else 'Atualização de evento'
    end;

    v_body := case new.event_type
      when 'event.registration_confirmed' then
        'Sua inscrição' || coalesce(' em '||v_event_title,'') || ' está confirmada.'
      when 'event.waitlist_joined' then
        'O evento' || coalesce(' '||v_event_title,'') ||
        ' está lotado; sua posição foi adicionada à lista de espera.'
      when 'event.waitlist_promoted' then
        'Uma vaga foi liberada' || coalesce(' em '||v_event_title,'') ||
        ' e sua inscrição foi confirmada.'
      else
        'Há uma nova atualização em um evento.'
    end;
  end if;

  perform app_private.enqueue_notification(
    new.organization_id,
    new.auth_user_id,
    new.person_id,
    v_category,
    v_title,
    v_body,
    jsonb_build_object(
      'source', tg_table_name,
      'event_type', new.event_type,
      'payload', new.payload
    ),
    tg_table_name || ':' || new.id::text
  );

  return new;
exception
  when others then
    return new;
end;
$function$;

notify pgrst,'reload schema';
