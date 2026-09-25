-- ELO v3.1 — Comunicação + Notificações/Push
-- Additive only. Existing schedule/event outboxes remain the producers.

create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  push_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  schedules_enabled boolean not null default true,
  events_enabled boolean not null default true,
  kids_enabled boolean not null default true,
  community_enabled boolean not null default true,
  care_enabled boolean not null default true,
  communication_enabled boolean not null default true,
  system_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'expo' check (provider = 'expo'),
  push_token text not null check (length(push_token) between 10 and 512),
  platform text not null check (platform in ('android','ios')),
  device_key text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, push_token)
);

create index if not exists push_devices_user_org_idx
  on public.push_devices(user_id, organization_id);
create index if not exists push_devices_active_idx
  on public.push_devices(organization_id, user_id)
  where disabled_at is null;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid,
  category text not null check (
    category in ('schedule','event','kids','community','care','system','communication')
  ),
  title text not null check (length(trim(title)) between 1 and 140),
  body text not null check (length(trim(body)) between 1 and 800),
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null check (length(dedupe_key) between 3 and 300),
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_person_fk
    foreign key (person_id, organization_id)
    references public.people(id, organization_id)
    on delete set null,
  unique (organization_id, user_id, dedupe_key)
);

create index if not exists notifications_user_feed_idx
  on public.notifications(user_id, organization_id, created_at desc)
  where archived_at is null;
create index if not exists notifications_unread_idx
  on public.notifications(user_id, organization_id, created_at desc)
  where read_at is null and archived_at is null;

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id),
  title text not null check (length(trim(title)) between 2 and 140),
  body text not null check (length(trim(body)) between 2 and 1200),
  segment_type text not null default 'all'
    check (segment_type in ('all','department','role')),
  segment_value text,
  data jsonb not null default '{}'::jsonb,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists communication_messages_org_created_idx
  on public.communication_messages(organization_id, created_at desc);

create table if not exists app_private.notification_outbox (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid,
  category text not null check (
    category in ('schedule','event','kids','community','care','system','communication')
  ),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  lease_token uuid,
  leased_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_outbox_person_fk
    foreign key (person_id, organization_id)
    references public.people(id, organization_id)
    on delete set null,
  unique (organization_id, auth_user_id, dedupe_key)
);

create index if not exists notification_outbox_pending_idx
  on app_private.notification_outbox(available_at, id)
  where processed_at is null;
create index if not exists notification_outbox_lease_idx
  on app_private.notification_outbox(lease_token)
  where processed_at is null;

alter table public.notification_preferences enable row level security;
alter table public.push_devices enable row level security;
alter table public.notifications enable row level security;
alter table public.communication_messages enable row level security;

drop policy if exists notification_preferences_select_self on public.notification_preferences;
create policy notification_preferences_select_self
on public.notification_preferences for select
to authenticated
using (
  user_id = (select auth.uid())
  and app_private.is_org_member(organization_id)
);

drop policy if exists notification_preferences_insert_self on public.notification_preferences;
create policy notification_preferences_insert_self
on public.notification_preferences for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and app_private.is_org_member(organization_id)
);

drop policy if exists notification_preferences_update_self on public.notification_preferences;
create policy notification_preferences_update_self
on public.notification_preferences for update
to authenticated
using (
  user_id = (select auth.uid())
  and app_private.is_org_member(organization_id)
)
with check (
  user_id = (select auth.uid())
  and app_private.is_org_member(organization_id)
);

drop policy if exists push_devices_no_direct_client_access on public.push_devices;
create policy push_devices_no_direct_client_access
on public.push_devices for all
to authenticated
using (false)
with check (false);

drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self
on public.notifications for select
to authenticated
using (
  user_id = (select auth.uid())
  and app_private.is_org_member(organization_id)
);

drop policy if exists communication_messages_select_manager on public.communication_messages;
create policy communication_messages_select_manager
on public.communication_messages for select
to authenticated
using (
  app_private.has_permission(organization_id, 'communication.send', null)
);

revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

revoke all on public.push_devices from anon, authenticated;
grant all on public.push_devices to service_role;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;

revoke all on public.communication_messages from anon, authenticated;
grant select on public.communication_messages to authenticated;
grant all on public.communication_messages to service_role;

grant all on app_private.notification_outbox to service_role;

create or replace function app_private.notification_allowed(
  p_user_id uuid,
  p_organization_id uuid,
  p_category text,
  p_channel text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pref public.notification_preferences%rowtype;
begin
  select *
  into v_pref
  from public.notification_preferences
  where user_id = p_user_id
    and organization_id = p_organization_id;

  if not found then
    return true;
  end if;

  if p_channel = 'push' and not v_pref.push_enabled then
    return false;
  end if;

  if p_channel = 'in_app' and not v_pref.in_app_enabled then
    return false;
  end if;

  return case p_category
    when 'schedule' then v_pref.schedules_enabled
    when 'event' then v_pref.events_enabled
    when 'kids' then v_pref.kids_enabled
    when 'community' then v_pref.community_enabled
    when 'care' then v_pref.care_enabled
    when 'communication' then v_pref.communication_enabled
    when 'system' then v_pref.system_enabled
    else true
  end;
end;
$$;

revoke all on function app_private.notification_allowed(uuid,uuid,text,text)
  from public, anon, authenticated;

create or replace function app_private.enqueue_notification(
  p_organization_id uuid,
  p_auth_user_id uuid,
  p_person_id uuid,
  p_category text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_auth_user_id is null then
    return;
  end if;

  if p_category not in ('schedule','event','kids','community','care','system','communication') then
    raise exception 'Invalid notification category';
  end if;

  if app_private.notification_allowed(
    p_auth_user_id,p_organization_id,p_category,'in_app'
  ) then
    insert into public.notifications(
      organization_id,user_id,person_id,category,title,body,data,dedupe_key
    )
    values(
      p_organization_id,p_auth_user_id,p_person_id,p_category,
      left(trim(p_title),140),left(trim(p_body),800),
      coalesce(p_data,'{}'::jsonb),p_dedupe_key
    )
    on conflict (organization_id,user_id,dedupe_key) do nothing;
  end if;

  if app_private.notification_allowed(
    p_auth_user_id,p_organization_id,p_category,'push'
  ) then
    insert into app_private.notification_outbox(
      organization_id,auth_user_id,person_id,category,title,body,data,dedupe_key
    )
    values(
      p_organization_id,p_auth_user_id,p_person_id,p_category,
      left(trim(p_title),140),left(trim(p_body),800),
      coalesce(p_data,'{}'::jsonb),p_dedupe_key
    )
    on conflict (organization_id,auth_user_id,dedupe_key) do nothing;
  end if;
end;
$$;

revoke all on function app_private.enqueue_notification(uuid,uuid,uuid,text,text,text,jsonb,text)
  from public, anon, authenticated;

create or replace function app_private.bridge_domain_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_title text;
  v_body text;
  v_event_title text;
begin
  if new.auth_user_id is null then
    return new;
  end if;

  if tg_table_name = 'schedule_notification_outbox' then
    v_category := 'schedule';

    if new.payload ? 'event_title' then
      v_event_title := nullif(new.payload->>'event_title','');
    elsif new.payload ? 'event_id' then
      select e.title into v_event_title
      from public.events e
      where e.id = nullif(new.payload->>'event_id','')::uuid
        and e.organization_id = new.organization_id;
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
        'Você foi escalado' || coalesce(' para '||v_event_title,'') ||
        coalesce(' como '||nullif(new.payload->>'role_label',''),'') || '.'
      when 'schedule.confirmed' then
        'Sua confirmação de escala foi registrada.'
      when 'schedule.substitution_invite' then
        'Há uma solicitação de substituição disponível para você.'
      when 'schedule.substitution_completed' then
        'Sua substituição foi concluída.'
      when 'schedule.substitution_accepted' then
        'A substituição foi aceita e a escala já está com você.'
      when 'schedule.declined' then
        'Uma escala foi recusada e precisa de atenção.'
      else
        'Há uma nova atualização em suas escalas.'
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
    -- A notification must never break the domain transaction.
    return new;
end;
$$;

revoke all on function app_private.bridge_domain_notice()
  from public, anon, authenticated;

drop trigger if exists trg_schedule_notification_bridge
  on app_private.schedule_notification_outbox;
create trigger trg_schedule_notification_bridge
after insert on app_private.schedule_notification_outbox
for each row execute function app_private.bridge_domain_notice();

drop trigger if exists trg_event_notification_bridge
  on app_private.event_notification_outbox;
create trigger trg_event_notification_bridge
after insert on app_private.event_notification_outbox
for each row execute function app_private.bridge_domain_notice();

create or replace function app_private.notify_kids_guardian_call()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
  v_child_name text;
begin
  select p.auth_user_id
  into v_auth_user_id
  from public.people p
  where p.id = new.guardian_person_id
    and p.organization_id = new.organization_id
    and p.record_status = 'active';

  if v_auth_user_id is null then
    return new;
  end if;

  select coalesce(nullif(cp.preferred_name,''),cp.full_name)
  into v_child_name
  from public.kids_checkins kc
  join public.people cp
    on cp.id = kc.child_person_id
   and cp.organization_id = kc.organization_id
  where kc.id = new.checkin_id
    and kc.organization_id = new.organization_id;

  perform app_private.enqueue_notification(
    new.organization_id,
    v_auth_user_id,
    new.guardian_person_id,
    'kids',
    'Elo Kids chamou você',
    coalesce(v_child_name || ' precisa do responsável.', 'A equipe do Elo Kids precisa falar com você.'),
    jsonb_build_object(
      'guardian_call_id',new.id,
      'checkin_id',new.checkin_id,
      'status',new.status
    ),
    'kids.guardian_call:'||new.id::text
  );

  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function app_private.notify_kids_guardian_call()
  from public, anon, authenticated;

drop trigger if exists trg_kids_guardian_call_notification
  on public.kids_guardian_calls;
create trigger trg_kids_guardian_call_notification
after insert on public.kids_guardian_calls
for each row
when (new.status = 'SENT')
execute function app_private.notify_kids_guardian_call();

create or replace function public.register_push_device(
  p_organization_id uuid,
  p_push_token text,
  p_platform text,
  p_device_key text default null,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_token text := trim(p_push_token);
  v_platform text := lower(trim(p_platform));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.is_org_member(p_organization_id) then
    raise exception 'Organization access denied' using errcode='42501';
  end if;

  if v_platform not in ('android','ios') then
    raise exception 'Invalid platform';
  end if;

  if length(v_token) < 10 or length(v_token) > 512 then
    raise exception 'Invalid push token';
  end if;

  if nullif(trim(p_device_key),'') is not null then
    update public.push_devices
    set disabled_at = now(), updated_at = now()
    where user_id = auth.uid()
      and organization_id = p_organization_id
      and provider = 'expo'
      and device_key = nullif(trim(p_device_key),'')
      and push_token <> v_token
      and disabled_at is null;
  end if;

  insert into public.push_devices(
    user_id,organization_id,provider,push_token,platform,
    device_key,app_version,last_seen_at,disabled_at,updated_at
  )
  values(
    auth.uid(),p_organization_id,'expo',v_token,v_platform,
    nullif(trim(p_device_key),''),nullif(trim(p_app_version),''),
    now(),null,now()
  )
  on conflict (provider,push_token) do update
  set user_id=excluded.user_id,
      organization_id=excluded.organization_id,
      platform=excluded.platform,
      device_key=excluded.device_key,
      app_version=excluded.app_version,
      last_seen_at=now(),
      disabled_at=null,
      updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.unregister_push_device(
  p_push_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  update public.push_devices
  set disabled_at=now(),updated_at=now()
  where user_id=auth.uid()
    and provider='expo'
    and push_token=trim(p_push_token)
    and disabled_at is null;

  get diagnostics v_count=row_count;
  return v_count>0;
end;
$$;

create or replace function public.save_notification_preferences(
  p_organization_id uuid,
  p_push_enabled boolean default true,
  p_in_app_enabled boolean default true,
  p_schedules_enabled boolean default true,
  p_events_enabled boolean default true,
  p_kids_enabled boolean default true,
  p_community_enabled boolean default true,
  p_care_enabled boolean default true,
  p_communication_enabled boolean default true,
  p_system_enabled boolean default true
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.notification_preferences%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.is_org_member(p_organization_id) then
    raise exception 'Organization access denied' using errcode='42501';
  end if;

  insert into public.notification_preferences(
    user_id,organization_id,push_enabled,in_app_enabled,
    schedules_enabled,events_enabled,kids_enabled,community_enabled,
    care_enabled,communication_enabled,system_enabled,updated_at
  )
  values(
    auth.uid(),p_organization_id,coalesce(p_push_enabled,true),coalesce(p_in_app_enabled,true),
    coalesce(p_schedules_enabled,true),coalesce(p_events_enabled,true),
    coalesce(p_kids_enabled,true),coalesce(p_community_enabled,true),
    coalesce(p_care_enabled,true),coalesce(p_communication_enabled,true),
    coalesce(p_system_enabled,true),now()
  )
  on conflict (user_id,organization_id) do update
  set push_enabled=excluded.push_enabled,
      in_app_enabled=excluded.in_app_enabled,
      schedules_enabled=excluded.schedules_enabled,
      events_enabled=excluded.events_enabled,
      kids_enabled=excluded.kids_enabled,
      community_enabled=excluded.community_enabled,
      care_enabled=excluded.care_enabled,
      communication_enabled=excluded.communication_enabled,
      system_enabled=excluded.system_enabled,
      updated_at=now()
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  update public.notifications
  set read_at=coalesce(read_at,now())
  where id=p_notification_id
    and user_id=auth.uid();

  get diagnostics v_count=row_count;
  return v_count>0;
end;
$$;

create or replace function public.mark_all_notifications_read(
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.is_org_member(p_organization_id) then
    raise exception 'Organization access denied' using errcode='42501';
  end if;

  update public.notifications
  set read_at=now()
  where user_id=auth.uid()
    and organization_id=p_organization_id
    and read_at is null
    and archived_at is null;

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.send_communication(
  p_organization_id uuid,
  p_title text,
  p_body text,
  p_segment_type text default 'all',
  p_segment_value text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  if length(trim(p_title)) not between 2 and 140 then
    raise exception 'Title must contain between 2 and 140 characters';
  end if;

  if length(trim(p_body)) not between 2 and 1200 then
    raise exception 'Body must contain between 2 and 1200 characters';
  end if;

  if v_segment not in ('all','department','role') then
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
$$;

-- Service-only leasing API for the Edge dispatcher.
create or replace function public.claim_push_notifications(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease uuid := gen_random_uuid();
  v_items jsonb;
begin
  with picked as (
    select o.id
    from app_private.notification_outbox o
    where o.processed_at is null
      and o.available_at<=now()
      and o.attempts<8
      and (o.leased_at is null or o.leased_at<now()-interval '5 minutes')
    order by o.available_at,o.id
    limit greatest(1,least(coalesce(p_limit,100),200))
    for update skip locked
  )
  update app_private.notification_outbox o
  set lease_token=v_lease,
      leased_at=now(),
      attempts=o.attempts+1
  from picked
  where o.id=picked.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',o.id,
        'organization_id',o.organization_id,
        'auth_user_id',o.auth_user_id,
        'category',o.category,
        'title',o.title,
        'body',o.body,
        'data',o.data,
        'attempts',o.attempts,
        'tokens',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'token',d.push_token,
              'platform',d.platform
            )
          )
          from public.push_devices d
          where d.user_id=o.auth_user_id
            and d.organization_id=o.organization_id
            and d.provider='expo'
            and d.disabled_at is null
        ),'[]'::jsonb)
      )
      order by o.id
    ),
    '[]'::jsonb
  )
  into v_items
  from app_private.notification_outbox o
  where o.lease_token=v_lease
    and o.processed_at is null;

  return jsonb_build_object(
    'lease_token',v_lease,
    'items',v_items
  );
end;
$$;

create or replace function public.complete_push_notifications(
  p_lease_token uuid,
  p_results jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_count integer:=0;
  v_id bigint;
  v_ok boolean;
  v_error text;
begin
  if jsonb_typeof(coalesce(p_results,'[]'::jsonb))<>'array' then
    raise exception 'Results must be an array';
  end if;

  for v_result in
    select value from jsonb_array_elements(coalesce(p_results,'[]'::jsonb))
  loop
    v_id := (v_result->>'id')::bigint;
    v_ok := coalesce((v_result->>'ok')::boolean,false);
    v_error := left(nullif(v_result->>'error',''),500);

    update app_private.notification_outbox
    set processed_at=case when v_ok then now() else null end,
        last_error=case when v_ok then null else coalesce(v_error,'Push delivery failed') end,
        available_at=case
          when v_ok then available_at
          else now()+make_interval(secs=>least(1800,30*(2^least(attempts,6))::int))
        end,
        lease_token=null,
        leased_at=null
    where id=v_id
      and lease_token=p_lease_token
      and processed_at is null;

    if found then
      v_count:=v_count+1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- Client RPC access: only authenticated users.
revoke all on function public.register_push_device(uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.register_push_device(uuid,text,text,text,text)
  to authenticated;

revoke all on function public.unregister_push_device(text)
  from public, anon, authenticated;
grant execute on function public.unregister_push_device(text)
  to authenticated;

revoke all on function public.save_notification_preferences(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) from public, anon, authenticated;
grant execute on function public.save_notification_preferences(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;

revoke all on function public.mark_notification_read(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid)
  to authenticated;

revoke all on function public.mark_all_notifications_read(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_all_notifications_read(uuid)
  to authenticated;

revoke all on function public.send_communication(uuid,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.send_communication(uuid,text,text,text,text,jsonb)
  to authenticated;

-- Worker RPC access: service_role only.
revoke all on function public.claim_push_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer)
  to service_role;

revoke all on function public.complete_push_notifications(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_push_notifications(uuid,jsonb)
  to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

