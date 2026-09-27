-- ELO v40 — convite de pregador + agenda pessoal
-- Aplicada no Supabase em 2026-09-27 como elo_preacher_invitations_personal_agenda_v40.

create table if not exists public.preacher_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  preacher_person_id uuid not null,
  theme text,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  invited_by uuid not null references auth.users(id),
  responded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preacher_invitations_person_fk
    foreign key (preacher_person_id, organization_id)
    references public.people(id, organization_id)
    on delete cascade,
  constraint preacher_invitations_theme_len
    check (theme is null or length(trim(theme)) between 1 and 180)
);

create index if not exists preacher_invitations_event_idx
  on public.preacher_invitations(organization_id, event_id, created_at desc);

create index if not exists preacher_invitations_person_idx
  on public.preacher_invitations(organization_id, preacher_person_id, created_at desc);

create unique index if not exists preacher_invitations_one_open_event_idx
  on public.preacher_invitations(organization_id, event_id)
  where status in ('pending','accepted');

alter table public.preacher_invitations enable row level security;

revoke all on public.preacher_invitations from public, anon, authenticated;
grant all on public.preacher_invitations to service_role;

create or replace function public.list_preacher_candidates(
  p_organization_id uuid,
  p_event_id uuid
)
returns table(
  person_id uuid,
  person_name text,
  email text,
  has_login boolean
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_unit_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select e.unit_id
  into v_unit_id
  from public.events e
  join public.services s
    on s.event_id=e.id
   and s.organization_id=e.organization_id
  where e.id=p_event_id
    and e.organization_id=p_organization_id
    and e.status='published';

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
    p.id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    p.email,
    p.auth_user_id is not null
  from public.people p
  where p.organization_id=p_organization_id
    and p.record_status='active'
  order by
    (p.auth_user_id is not null) desc,
    lower(coalesce(nullif(p.preferred_name,''),p.full_name));
end;
$function$;

revoke all on function public.list_preacher_candidates(uuid,uuid)
from public, anon;
grant execute on function public.list_preacher_candidates(uuid,uuid)
to authenticated;

create or replace function public.get_event_preacher_invitation(
  p_organization_id uuid,
  p_event_id uuid
)
returns table(
  invitation_id uuid,
  preacher_person_id uuid,
  preacher_name text,
  theme text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
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
    i.responded_at
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
$function$;

revoke all on function public.get_event_preacher_invitation(uuid,uuid)
from public, anon;
grant execute on function public.get_event_preacher_invitation(uuid,uuid)
to authenticated;

create or replace function public.invite_preacher(
  p_organization_id uuid,
  p_event_id uuid,
  p_preacher_person_id uuid,
  p_theme text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_event public.events%rowtype;
  v_person public.people%rowtype;
  v_services public.services%rowtype;
  v_invitation_id uuid;
  v_theme text:=nullif(trim(coalesce(p_theme,'')),'');
  v_when text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_event
  from public.events
  where id=p_event_id
    and organization_id=p_organization_id
    and status='published';

  if not found then
    raise exception 'Service not found';
  end if;

  select * into v_services
  from public.services
  where event_id=p_event_id
    and organization_id=p_organization_id;

  if not found then
    raise exception 'Service details not found';
  end if;

  if v_event.starts_at < now()-interval '2 hours' then
    raise exception 'Cannot invite a preacher to a service that has already passed';
  end if;

  if not app_private.has_permission(
    p_organization_id,
    'schedules.manage',
    v_event.unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_theme is not null and length(v_theme)>180 then
    raise exception 'Theme is too long';
  end if;

  if exists (
    select 1
    from public.preacher_invitations i
    where i.organization_id=p_organization_id
      and i.event_id=p_event_id
      and i.status in ('pending','accepted')
  ) then
    raise exception 'This service already has an active preacher invitation';
  end if;

  select * into v_person
  from public.people
  where id=p_preacher_person_id
    and organization_id=p_organization_id
    and record_status='active';

  if not found then
    raise exception 'Preacher not found';
  end if;

  if v_person.auth_user_id is null then
    raise exception 'This person needs Elo access before receiving a preacher invitation';
  end if;

  insert into public.preacher_invitations(
    organization_id,
    unit_id,
    event_id,
    preacher_person_id,
    theme,
    status,
    invited_by
  )
  values(
    p_organization_id,
    v_event.unit_id,
    p_event_id,
    p_preacher_person_id,
    v_theme,
    'pending',
    auth.uid()
  )
  returning id into v_invitation_id;

  select to_char(
    v_event.starts_at at time zone coalesce(u.timezone,'America/Sao_Paulo'),
    'DD/MM/YYYY "às" HH24:MI'
  )
  into v_when
  from public.units u
  where u.id=v_event.unit_id
    and u.organization_id=p_organization_id;

  perform app_private.enqueue_notification(
    p_organization_id,
    v_person.auth_user_id,
    v_person.id,
    'schedule',
    'Convite para pregar',
    'Você foi convidado para pregar em ' || v_event.title ||
      coalesce(' no dia '||v_when,'') ||
      case when v_theme is not null then '. Tema: '||v_theme else '' end ||
      '. Abra suas escalas para aceitar ou recusar.',
    jsonb_build_object(
      'target_module','schedules',
      'kind','preacher_invitation',
      'preacher_invitation_id',v_invitation_id,
      'event_id',v_event.id,
      'event_title',v_event.title,
      'starts_at',v_event.starts_at,
      'theme',v_theme
    ),
    'preacher.invite:'||v_invitation_id::text
  );

  perform app_private.write_audit(
    p_organization_id,
    v_event.unit_id,
    'service.preacher_invited',
    'preacher_invitations',
    v_invitation_id,
    jsonb_build_object(
      'event_id',v_event.id,
      'preacher_person_id',v_person.id,
      'theme',v_theme
    )
  );

  return v_invitation_id;
end;
$function$;

revoke all on function public.invite_preacher(uuid,uuid,uuid,text)
from public, anon;
grant execute on function public.invite_preacher(uuid,uuid,uuid,text)
to authenticated;

create or replace function public.cancel_preacher_invitation(
  p_organization_id uuid,
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_inv public.preacher_invitations%rowtype;
  v_event public.events%rowtype;
  v_person public.people%rowtype;
  v_preacher_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_inv
  from public.preacher_invitations
  where id=p_invitation_id
    and organization_id=p_organization_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  select * into v_event
  from public.events
  where id=v_inv.event_id
    and organization_id=p_organization_id;

  if not found then
    raise exception 'Service not found';
  end if;

  if not app_private.has_permission(
    p_organization_id,
    'schedules.manage',
    v_event.unit_id
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_inv.status='cancelled' then
    return true;
  end if;

  select * into v_person
  from public.people
  where id=v_inv.preacher_person_id
    and organization_id=p_organization_id;

  v_preacher_name:=coalesce(nullif(v_person.preferred_name,''),v_person.full_name);

  update public.preacher_invitations
  set status='cancelled',
      cancelled_at=now(),
      updated_at=now()
  where id=v_inv.id;

  if v_inv.status='accepted' then
    update public.services
    set preacher_name=null,
        updated_at=now()
    where event_id=v_inv.event_id
      and organization_id=p_organization_id
      and preacher_name=v_preacher_name;
  end if;

  if v_person.auth_user_id is not null then
    perform app_private.enqueue_notification(
      p_organization_id,
      v_person.auth_user_id,
      v_person.id,
      'schedule',
      'Convite de pregação cancelado',
      'O convite para pregar em '||v_event.title||' foi cancelado pela liderança.',
      jsonb_build_object(
        'target_module','schedules',
        'kind','preacher_invitation_cancelled',
        'preacher_invitation_id',v_inv.id,
        'event_id',v_event.id
      ),
      'preacher.cancel:'||v_inv.id::text
    );
  end if;

  perform app_private.write_audit(
    p_organization_id,
    v_event.unit_id,
    'service.preacher_invitation_cancelled',
    'preacher_invitations',
    v_inv.id,
    jsonb_build_object('event_id',v_event.id)
  );

  return true;
end;
$function$;

revoke all on function public.cancel_preacher_invitation(uuid,uuid)
from public, anon;
grant execute on function public.cancel_preacher_invitation(uuid,uuid)
to authenticated;

create or replace function public.respond_my_preacher_invitation(
  p_invitation_id uuid,
  p_response text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_inv public.preacher_invitations%rowtype;
  v_event public.events%rowtype;
  v_person public.people%rowtype;
  v_response text:=lower(trim(coalesce(p_response,'')));
  v_status text;
  v_name text;
  v_when text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if v_response not in ('accept','decline') then
    raise exception 'Invalid response';
  end if;

  select * into v_inv
  from public.preacher_invitations
  where id=p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_inv.status<>'pending' then
    raise exception 'This invitation has already been answered';
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

  if not found then
    raise exception 'Service not found';
  end if;

  if v_event.starts_at < now()-interval '2 hours' then
    raise exception 'This service has already passed';
  end if;

  v_status:=case when v_response='accept' then 'accepted' else 'declined' end;
  v_name:=coalesce(nullif(v_person.preferred_name,''),v_person.full_name);

  update public.preacher_invitations
  set status=v_status,
      responded_at=now(),
      updated_at=now()
  where id=v_inv.id;

  if v_status='accepted' then
    update public.services
    set preacher_name=v_name,
        theme=coalesce(v_inv.theme,theme),
        updated_at=now()
    where event_id=v_inv.event_id
      and organization_id=v_inv.organization_id;
  end if;

  select to_char(
    v_event.starts_at at time zone coalesce(u.timezone,'America/Sao_Paulo'),
    'DD/MM/YYYY "às" HH24:MI'
  )
  into v_when
  from public.units u
  where u.id=v_event.unit_id
    and u.organization_id=v_inv.organization_id;

  perform app_private.enqueue_notification(
    v_inv.organization_id,
    v_inv.invited_by,
    null,
    'schedule',
    case when v_status='accepted'
      then 'Convite de pregação aceito'
      else 'Convite de pregação recusado'
    end,
    v_name ||
      case when v_status='accepted' then ' aceitou' else ' recusou' end ||
      ' o convite para pregar em '||v_event.title||
      coalesce(' em '||v_when,'')||'.',
    jsonb_build_object(
      'target_module','schedules',
      'kind','preacher_invitation_response',
      'preacher_invitation_id',v_inv.id,
      'event_id',v_event.id,
      'response',v_status
    ),
    'preacher.response:'||v_inv.id::text||':'||v_status
  );

  perform app_private.write_audit(
    v_inv.organization_id,
    v_event.unit_id,
    'service.preacher_invitation_'||v_status,
    'preacher_invitations',
    v_inv.id,
    jsonb_build_object('event_id',v_event.id,'preacher_person_id',v_person.id)
  );

  return true;
end;
$function$;

revoke all on function public.respond_my_preacher_invitation(uuid,text)
from public, anon;
grant execute on function public.respond_my_preacher_invitation(uuid,text)
to authenticated;

create or replace function public.list_my_preacher_invitations(
  p_organization_id uuid
)
returns table(
  invitation_id uuid,
  event_id uuid,
  event_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_name text,
  theme text,
  status text
)
language plpgsql
stable
security definer
set search_path=''
as $function$
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
    i.status
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
$function$;

revoke all on function public.list_my_preacher_invitations(uuid)
from public, anon;
grant execute on function public.list_my_preacher_invitations(uuid)
to authenticated;

notify pgrst,'reload schema';
