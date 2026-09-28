-- ELO v41 — comunicação, lembretes e indisponibilidade de pregador

alter table public.preacher_invitations
  add column if not exists unavailable_reported_at timestamptz,
  add column if not exists unavailable_note text;

alter table public.communication_messages
  drop constraint if exists communication_messages_segment_type_check;

alter table public.communication_messages
  add constraint communication_messages_segment_type_check
  check (segment_type in ('all','workers','department','role'));

CREATE OR REPLACE FUNCTION public.send_communication(p_organization_id uuid, p_title text, p_body text, p_segment_type text DEFAULT 'all'::text, p_segment_value text DEFAULT NULL::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := gen_random_uuid();
  v_segment text := lower(trim(coalesce(p_segment_type,'all')));
  v_segment_uuid uuid;
  v_recipient record;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(
    p_organization_id,'communication.send',null
  ) then
    raise exception 'Communication permission denied' using errcode='42501';
  end if;

  -- Compatibilidade com versões anteriores do app.
  if v_segment in ('organization','church','igreja') then
    v_segment := 'all';
  end if;

  if length(trim(p_title)) not between 2 and 140 then
    raise exception 'Title must contain between 2 and 140 characters';
  end if;

  if length(trim(p_body)) not between 2 and 1200 then
    raise exception 'Body must contain between 2 and 1200 characters';
  end if;

  if v_segment not in ('all','workers','department','role') then
    raise exception 'Invalid segment';
  end if;

  if v_segment = 'department' then
    v_segment_uuid := nullif(trim(p_segment_value),'')::uuid;
    if v_segment_uuid is null then
      raise exception 'Department is required';
    end if;
  elsif v_segment = 'role' and nullif(trim(p_segment_value),'') is null then
    raise exception 'Role is required';
  end if;

  insert into public.communication_messages(
    id,organization_id,sender_user_id,title,body,
    segment_type,segment_value,data,recipient_count
  )
  values(
    v_id,p_organization_id,auth.uid(),trim(p_title),trim(p_body),
    v_segment,nullif(trim(p_segment_value),''),
    coalesce(p_data,'{}'::jsonb),0
  );

  for v_recipient in
    select distinct p.id as person_id,p.auth_user_id
    from public.people p
    join public.organization_memberships om
      on om.person_id=p.id
     and om.organization_id=p.organization_id
     and om.status='active'
    where p.organization_id=p_organization_id
      and p.record_status='active'
      and p.auth_user_id is not null
      and (
        v_segment='all'
        or (
          v_segment='workers'
          and (
            exists (
              select 1
              from public.department_members dm
              where dm.organization_id=p.organization_id
                and dm.person_id=p.id
                and dm.status='active'
            )
            or exists (
              select 1
              from public.departments d
              where d.organization_id=p.organization_id
                and d.leader_person_id=p.id
                and d.active=true
            )
            or exists (
              select 1
              from public.schedule_assignments sa
              join public.events e
                on e.id=sa.event_id
               and e.organization_id=sa.organization_id
              where sa.organization_id=p.organization_id
                and sa.person_id=p.id
                and sa.status in ('pending','confirmed','replacement_requested')
                and e.status='published'
                and e.starts_at>=now()-interval '12 hours'
            )
            or exists (
              select 1
              from public.preacher_invitations pi
              join public.events e
                on e.id=pi.event_id
               and e.organization_id=pi.organization_id
              where pi.organization_id=p.organization_id
                and pi.preacher_person_id=p.id
                and pi.status='accepted'
                and e.status='published'
                and e.starts_at>=now()-interval '12 hours'
            )
          )
        )
        or (
          v_segment='department'
          and exists (
            select 1
            from public.department_members dm
            where dm.organization_id=p.organization_id
              and dm.person_id=p.id
              and dm.department_id=v_segment_uuid
              and dm.status='active'
          )
        )
        or (
          v_segment='role'
          and exists (
            select 1
            from public.user_role_assignments ura
            join public.roles r
              on r.id=ura.role_id
             and r.organization_id=ura.organization_id
            where ura.organization_id=p.organization_id
              and ura.person_id=p.id
              and ura.is_active=true
              and ura.starts_at<=now()
              and (ura.ends_at is null or ura.ends_at>=now())
              and r.is_active=true
              and lower(r.role_key)=lower(trim(p_segment_value))
          )
        )
      )
  loop
    perform app_private.enqueue_notification(
      p_organization_id,
      v_recipient.auth_user_id,
      v_recipient.person_id,
      'communication',
      trim(p_title),
      trim(p_body),
      jsonb_build_object(
        'communication_id',v_id,
        'segment_type',v_segment,
        'segment_value',nullif(trim(p_segment_value),''),
        'payload',coalesce(p_data,'{}'::jsonb)
      ),
      'communication:'||v_id::text||':'||v_recipient.auth_user_id::text
    );
    v_count:=v_count+1;
  end loop;

  update public.communication_messages
  set recipient_count=v_count
  where id=v_id;

  perform app_private.write_audit(
    p_organization_id,null,
    'communication.sent','communication_messages',v_id,
    jsonb_build_object(
      'segment_type',v_segment,
      'segment_value',nullif(trim(p_segment_value),''),
      'recipient_count',v_count
    )
  );

  return jsonb_build_object(
    'ok',true,
    'communication_id',v_id,
    'recipient_count',v_count
  );
end;
$function$

revoke all on function public.send_communication(uuid,text,text,text,text,jsonb)
from public, anon;
grant execute on function public.send_communication(uuid,text,text,text,text,jsonb)
to authenticated;

drop function if exists public.list_my_preacher_invitations(uuid);
CREATE OR REPLACE FUNCTION public.list_my_preacher_invitations(p_organization_id uuid)
 RETURNS TABLE(invitation_id uuid, event_id uuid, event_title text, starts_at timestamp with time zone, ends_at timestamp with time zone, location_name text, theme text, status text, unavailable_reported_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.is_org_member(p_organization_id) then
    raise exception 'Organization access denied' using errcode='42501';
  end if;

  return query
  select
    i.id,
    e.id,
    e.title,
    e.starts_at,
    e.ends_at,
    e.location_name,
    i.theme,
    i.status,
    i.unavailable_reported_at
  from public.preacher_invitations i
  join public.people p
    on p.id=i.preacher_person_id
   and p.organization_id=i.organization_id
  join public.events e
    on e.id=i.event_id
   and e.organization_id=i.organization_id
  where i.organization_id=p_organization_id
    and p.auth_user_id=auth.uid()
    and p.record_status='active'
    and i.status in ('pending','accepted')
    and e.status='published'
    and e.starts_at>=now()-interval '12 hours'
  order by e.starts_at,i.created_at desc;
end;
$function$

revoke all on function public.list_my_preacher_invitations(uuid)
from public, anon;
grant execute on function public.list_my_preacher_invitations(uuid)
to authenticated;

drop function if exists public.get_event_preacher_invitation(uuid,uuid);
CREATE OR REPLACE FUNCTION public.get_event_preacher_invitation(p_organization_id uuid, p_event_id uuid)
 RETURNS TABLE(invitation_id uuid, preacher_person_id uuid, preacher_name text, theme text, status text, created_at timestamp with time zone, responded_at timestamp with time zone, unavailable_reported_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unit_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select e.unit_id into v_unit_id
  from public.events e
  where e.id=p_event_id
    and e.organization_id=p_organization_id;

  if v_unit_id is null then
    raise exception 'Service not found';
  end if;

  if not app_private.has_permission(
    p_organization_id,
    'schedules.manage',
    v_unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  return query
  select
    i.id,
    i.preacher_person_id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    i.theme,
    i.status,
    i.created_at,
    i.responded_at,
    i.unavailable_reported_at
  from public.preacher_invitations i
  join public.people p
    on p.id=i.preacher_person_id
   and p.organization_id=i.organization_id
  where i.organization_id=p_organization_id
    and i.event_id=p_event_id
    and i.status<>'cancelled'
  order by
    case i.status
      when 'accepted' then 0
      when 'pending' then 1
      else 2
    end,
    i.created_at desc
  limit 1;
end;
$function$

revoke all on function public.get_event_preacher_invitation(uuid,uuid)
from public, anon;
grant execute on function public.get_event_preacher_invitation(uuid,uuid)
to authenticated;

CREATE OR REPLACE FUNCTION public.report_my_preacher_unavailability(p_invitation_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv public.preacher_invitations%rowtype;
  v_event public.events%rowtype;
  v_person public.people%rowtype;
  v_name text;
  v_when text;
  v_pastor_phone text;
  v_pastor_name text;
  v_recipient record;
  v_hours numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_inv
  from public.preacher_invitations
  where id=p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_inv.status<>'accepted' then
    raise exception 'Only an accepted invitation can request replacement';
  end if;

  select * into v_person
  from public.people
  where id=v_inv.preacher_person_id
    and organization_id=v_inv.organization_id
    and record_status='active';

  if not found or v_person.auth_user_id is distinct from auth.uid() then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select * into v_event
  from public.events
  where id=v_inv.event_id
    and organization_id=v_inv.organization_id
    and status='published';

  if not found or v_event.starts_at<=now() then
    raise exception 'This service is no longer eligible';
  end if;

  v_hours := extract(epoch from (v_event.starts_at-now()))/3600.0;
  v_name := coalesce(nullif(v_person.preferred_name,''),v_person.full_name);

  select
    p.phone,
    coalesce(nullif(p.preferred_name,''),p.full_name)
  into v_pastor_phone,v_pastor_name
  from public.people p
  join public.user_role_assignments ura
    on ura.organization_id=p.organization_id
   and ura.person_id=p.id
   and ura.is_active=true
   and ura.starts_at<=now()
   and (ura.ends_at is null or ura.ends_at>=now())
  join public.roles r
    on r.id=ura.role_id
   and r.organization_id=ura.organization_id
   and r.is_active=true
   and lower(r.role_key)='pastor'
  where p.organization_id=v_inv.organization_id
    and p.record_status='active'
  order by (nullif(trim(coalesce(p.phone,'')),'') is not null) desc,p.created_at
  limit 1;

  if v_event.starts_at-now() < interval '48 hours' then
    return jsonb_build_object(
      'ok',false,
      'mode','contact_pastor',
      'hours_until',floor(v_hours),
      'pastor_phone',v_pastor_phone,
      'pastor_name',v_pastor_name
    );
  end if;

  if v_inv.unavailable_reported_at is not null then
    return jsonb_build_object(
      'ok',true,
      'mode','already_requested',
      'reported_at',v_inv.unavailable_reported_at
    );
  end if;

  update public.preacher_invitations
  set unavailable_reported_at=now(),
      unavailable_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=v_inv.id;

  select to_char(
    v_event.starts_at at time zone coalesce(u.timezone,'America/Sao_Paulo'),
    'DD/MM/YYYY "às" HH24:MI'
  )
  into v_when
  from public.units u
  where u.id=v_event.unit_id
    and u.organization_id=v_inv.organization_id;

  -- Quem fez o convite sempre recebe o alerta.
  perform app_private.enqueue_notification(
    v_inv.organization_id,
    v_inv.invited_by,
    null,
    'schedule',
    'Pregador solicitou troca',
    v_name||' informou que não poderá pregar em '||v_event.title||
      coalesce(' em '||v_when,'')||'. Faça a troca do pregador.',
    jsonb_build_object(
      'target_module','schedules',
      'kind','preacher_unavailability',
      'preacher_invitation_id',v_inv.id,
      'event_id',v_event.id
    ),
    'preacher.unavailable:'||v_inv.id::text||':'||v_inv.invited_by::text
  );

  -- Pastores ativos também recebem, sem duplicar quem já convidou.
  for v_recipient in
    select distinct p.auth_user_id,p.id as person_id
    from public.people p
    join public.user_role_assignments ura
      on ura.organization_id=p.organization_id
     and ura.person_id=p.id
     and ura.is_active=true
     and ura.starts_at<=now()
     and (ura.ends_at is null or ura.ends_at>=now())
    join public.roles r
      on r.id=ura.role_id
     and r.organization_id=ura.organization_id
     and r.is_active=true
     and lower(r.role_key)='pastor'
    where p.organization_id=v_inv.organization_id
      and p.record_status='active'
      and p.auth_user_id is not null
      and p.auth_user_id is distinct from v_inv.invited_by
  loop
    perform app_private.enqueue_notification(
      v_inv.organization_id,
      v_recipient.auth_user_id,
      v_recipient.person_id,
      'schedule',
      'Pregador solicitou troca',
      v_name||' informou que não poderá pregar em '||v_event.title||
        coalesce(' em '||v_when,'')||'. Faça a troca do pregador.',
      jsonb_build_object(
        'target_module','schedules',
        'kind','preacher_unavailability',
        'preacher_invitation_id',v_inv.id,
        'event_id',v_event.id
      ),
      'preacher.unavailable:'||v_inv.id::text||':'||v_recipient.auth_user_id::text
    );
  end loop;

  perform app_private.write_audit(
    v_inv.organization_id,
    v_event.unit_id,
    'service.preacher_unavailability_reported',
    'preacher_invitations',
    v_inv.id,
    jsonb_build_object('event_id',v_event.id,'hours_until',v_hours)
  );

  return jsonb_build_object(
    'ok',true,
    'mode','replacement_requested',
    'hours_until',floor(v_hours)
  );
end;
$function$

revoke all on function public.report_my_preacher_unavailability(uuid,text)
from public, anon;
grant execute on function public.report_my_preacher_unavailability(uuid,text)
to authenticated;

CREATE OR REPLACE FUNCTION app_private.process_commitment_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rec record;
  v_count integer := 0;
begin
  -- Escalas normais confirmadas: 24h e 1h antes.
  for v_rec in
    with windows as (
      select '24h'::text code, interval '23 hours 58 minutes' min_gap, interval '24 hours 2 minutes' max_gap
      union all
      select '1h', interval '58 minutes', interval '62 minutes'
    )
    select
      sa.organization_id,
      p.auth_user_id,
      p.id person_id,
      sa.id source_id,
      e.id event_id,
      e.title,
      e.starts_at,
      e.location_name,
      u.timezone,
      w.code
    from public.schedule_assignments sa
    join public.people p
      on p.id=sa.person_id
     and p.organization_id=sa.organization_id
     and p.record_status='active'
     and p.auth_user_id is not null
    join public.events e
      on e.id=sa.event_id
     and e.organization_id=sa.organization_id
     and e.status='published'
    join public.units u
      on u.id=e.unit_id
     and u.organization_id=e.organization_id
    cross join windows w
    where sa.status='confirmed'
      and e.starts_at-now() between w.min_gap and w.max_gap
  loop
    perform app_private.enqueue_notification(
      v_rec.organization_id,
      v_rec.auth_user_id,
      v_rec.person_id,
      'schedule',
      case when v_rec.code='24h'
        then 'Lembrete da sua escala amanhã'
        else 'Sua escala começa em 1 hora'
      end,
      v_rec.title||' • '||
        to_char(v_rec.starts_at at time zone coalesce(v_rec.timezone,'America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||
        coalesce(' • '||v_rec.location_name,''),
      jsonb_build_object(
        'target_module','schedules',
        'kind','schedule_reminder',
        'assignment_id',v_rec.source_id,
        'event_id',v_rec.event_id,
        'reminder',v_rec.code
      ),
      'reminder:schedule:'||v_rec.source_id::text||':'||v_rec.code
    );
    v_count:=v_count+1;
  end loop;

  -- Pregação aceita: 24h e 1h antes.
  for v_rec in
    with windows as (
      select '24h'::text code, interval '23 hours 58 minutes' min_gap, interval '24 hours 2 minutes' max_gap
      union all
      select '1h', interval '58 minutes', interval '62 minutes'
    )
    select
      pi.organization_id,
      p.auth_user_id,
      p.id person_id,
      pi.id source_id,
      e.id event_id,
      e.title,
      e.starts_at,
      e.location_name,
      u.timezone,
      w.code
    from public.preacher_invitations pi
    join public.people p
      on p.id=pi.preacher_person_id
     and p.organization_id=pi.organization_id
     and p.record_status='active'
     and p.auth_user_id is not null
    join public.events e
      on e.id=pi.event_id
     and e.organization_id=pi.organization_id
     and e.status='published'
    join public.units u
      on u.id=e.unit_id
     and u.organization_id=e.organization_id
    cross join windows w
    where pi.status='accepted'
      and pi.unavailable_reported_at is null
      and e.starts_at-now() between w.min_gap and w.max_gap
  loop
    perform app_private.enqueue_notification(
      v_rec.organization_id,
      v_rec.auth_user_id,
      v_rec.person_id,
      'schedule',
      case when v_rec.code='24h'
        then 'Lembrete: você prega amanhã'
        else 'Sua pregação começa em 1 hora'
      end,
      v_rec.title||' • '||
        to_char(v_rec.starts_at at time zone coalesce(v_rec.timezone,'America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||
        coalesce(' • '||v_rec.location_name,''),
      jsonb_build_object(
        'target_module','schedules',
        'kind','preacher_reminder',
        'preacher_invitation_id',v_rec.source_id,
        'event_id',v_rec.event_id,
        'reminder',v_rec.code
      ),
      'reminder:preacher:'||v_rec.source_id::text||':'||v_rec.code
    );
    v_count:=v_count+1;
  end loop;

  -- Atendimento pastoral confirmado: membro e pastor/proponente.
  for v_rec in
    with windows as (
      select '24h'::text code, interval '23 hours 58 minutes' min_gap, interval '24 hours 2 minutes' max_gap
      union all
      select '1h', interval '58 minutes', interval '62 minutes'
    ),
    recipients as (
      select
        pr.id request_id,
        pr.organization_id,
        pr.proposed_start_at starts_at,
        member.auth_user_id,
        member.id person_id,
        'member'::text recipient_kind
      from public.pastoral_requests pr
      join public.people member
        on member.id=pr.person_id
       and member.organization_id=pr.organization_id
       and member.record_status='active'
       and member.auth_user_id is not null
      where pr.status='CONFIRMED'

      union all

      select
        pr.id,
        pr.organization_id,
        pr.proposed_start_at,
        pastor.auth_user_id,
        pastor.id,
        'pastor'::text
      from public.pastoral_requests pr
      join public.people pastor
        on pastor.id=pr.proposed_by_person_id
       and pastor.organization_id=pr.organization_id
       and pastor.record_status='active'
       and pastor.auth_user_id is not null
      where pr.status='CONFIRMED'
    )
    select r.*,w.code
    from recipients r
    cross join windows w
    where r.starts_at is not null
      and r.starts_at-now() between w.min_gap and w.max_gap
  loop
    perform app_private.enqueue_notification(
      v_rec.organization_id,
      v_rec.auth_user_id,
      v_rec.person_id,
      'care',
      case
        when v_rec.code='24h' and v_rec.recipient_kind='member'
          then 'Seu atendimento pastoral é amanhã'
        when v_rec.code='24h'
          then 'Atendimento pastoral amanhã'
        when v_rec.recipient_kind='member'
          then 'Seu atendimento começa em 1 hora'
        else 'Atendimento pastoral em 1 hora'
      end,
      'Horário: '||
        to_char(v_rec.starts_at at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI')||'.',
      jsonb_build_object(
        'type','pastoral_request',
        'request_id',v_rec.request_id,
        'kind','pastoral_reminder',
        'reminder',v_rec.code
      ),
      'reminder:pastoral:'||v_rec.request_id::text||':'||
        v_rec.auth_user_id::text||':'||v_rec.code
    );
    v_count:=v_count+1;
  end loop;

  -- Inscrições confirmadas em eventos: responsável recebe 24h e 1h antes.
  for v_rec in
    with windows as (
      select '24h'::text code, interval '23 hours 58 minutes' min_gap, interval '24 hours 2 minutes' max_gap
      union all
      select '1h', interval '58 minutes', interval '62 minutes'
    )
    select
      o.organization_id,
      p.auth_user_id,
      p.id person_id,
      o.id source_id,
      e.id event_id,
      e.title,
      e.starts_at,
      e.location_name,
      u.timezone,
      w.code
    from public.event_registration_orders o
    join public.people p
      on p.id=o.owner_person_id
     and p.organization_id=o.organization_id
     and p.record_status='active'
     and p.auth_user_id is not null
    join public.events e
      on e.id=o.event_id
     and e.organization_id=o.organization_id
     and e.status='published'
    join public.units u
      on u.id=e.unit_id
     and u.organization_id=e.organization_id
    cross join windows w
    where lower(o.status)='confirmed'
      and e.starts_at-now() between w.min_gap and w.max_gap
  loop
    perform app_private.enqueue_notification(
      v_rec.organization_id,
      v_rec.auth_user_id,
      v_rec.person_id,
      'event',
      case when v_rec.code='24h'
        then 'Seu evento é amanhã'
        else 'Seu evento começa em 1 hora'
      end,
      v_rec.title||' • '||
        to_char(v_rec.starts_at at time zone coalesce(v_rec.timezone,'America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||
        coalesce(' • '||v_rec.location_name,''),
      jsonb_build_object(
        'target_module','events',
        'kind','event_reminder',
        'registration_id',v_rec.source_id,
        'event_id',v_rec.event_id,
        'reminder',v_rec.code
      ),
      'reminder:event:'||v_rec.source_id::text||':'||v_rec.code
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$

revoke all on function app_private.process_commitment_reminders()
from public, anon, authenticated;

do $block$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='elo-commitment-reminders-v41'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'elo-commitment-reminders-v41',
    '* * * * *',
    'select app_private.process_commitment_reminders();'
  );
end;
$block$;

notify pgrst,'reload schema';
