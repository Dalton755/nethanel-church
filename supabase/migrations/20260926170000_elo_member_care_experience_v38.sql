-- Elo member experience: prayer, pastoral care and contribution information.

create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (length(trim(message)) between 5 and 2000),
  visibility text not null default 'PASTORAL'
    check (visibility in ('PASTORAL','PRAYER_TEAM')),
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED','IN_PRAYER','ANSWERED','CLOSED')),
  response_text text,
  responded_by_person_id uuid,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prayer_requests_person_fk
    foreign key (person_id, organization_id)
    references public.people(id, organization_id)
    on delete cascade,
  constraint prayer_requests_responder_fk
    foreign key (responded_by_person_id, organization_id)
    references public.people(id, organization_id)
    on delete set null
);

create index if not exists prayer_requests_org_status_created_idx
  on public.prayer_requests(organization_id, status, created_at desc);
create index if not exists prayer_requests_person_created_idx
  on public.prayer_requests(organization_id, person_id, created_at desc);

create table if not exists public.pastoral_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 5 and 1200),
  availability_notes text,
  status text not null default 'REQUESTED'
    check (status in (
      'REQUESTED','PROPOSED','CONFIRMED',
      'RESCHEDULE_REQUESTED','COMPLETED','CANCELLED'
    )),
  proposed_start_at timestamptz,
  proposed_end_at timestamptz,
  proposed_by_person_id uuid,
  proposal_note text,
  member_response_note text,
  member_responded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pastoral_requests_person_fk
    foreign key (person_id, organization_id)
    references public.people(id, organization_id)
    on delete cascade,
  constraint pastoral_requests_proposer_fk
    foreign key (proposed_by_person_id, organization_id)
    references public.people(id, organization_id)
    on delete set null,
  constraint pastoral_requests_proposed_time_ck
    check (
      proposed_end_at is null
      or proposed_start_at is null
      or proposed_end_at > proposed_start_at
    )
);

create index if not exists pastoral_requests_org_status_created_idx
  on public.pastoral_requests(organization_id, status, created_at desc);
create index if not exists pastoral_requests_person_created_idx
  on public.pastoral_requests(organization_id, person_id, created_at desc);
create index if not exists pastoral_requests_schedule_idx
  on public.pastoral_requests(organization_id, proposed_start_at)
  where status in ('PROPOSED','CONFIRMED');

create table if not exists public.organization_contribution_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  pix_key_type text
    check (pix_key_type is null or pix_key_type in ('CPF','CNPJ','EMAIL','PHONE','RANDOM','COPY_PASTE')),
  pix_key text,
  pix_copy_paste text,
  beneficiary_name text,
  bank_name text,
  instructions text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contribution_settings_has_value_ck
    check (
      not enabled
      or nullif(trim(coalesce(pix_key,'')),'') is not null
      or nullif(trim(coalesce(pix_copy_paste,'')),'') is not null
    )
);

alter table public.prayer_requests enable row level security;
alter table public.pastoral_requests enable row level security;
alter table public.organization_contribution_settings enable row level security;

revoke all on public.prayer_requests from anon, authenticated;
revoke all on public.pastoral_requests from anon, authenticated;
revoke all on public.organization_contribution_settings from anon, authenticated;
grant all on public.prayer_requests to service_role;
grant all on public.pastoral_requests to service_role;
grant all on public.organization_contribution_settings to service_role;

create or replace function public.create_prayer_request(
  p_organization_id uuid,
  p_message text,
  p_visibility text default 'PASTORAL'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_id uuid;
  v_visibility text := upper(trim(coalesce(p_visibility,'PASTORAL')));
  v_recipient record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.is_org_member(p_organization_id)
     or not app_private.has_permission(p_organization_id,'prayer.create',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if length(trim(coalesce(p_message,''))) < 5 then
    raise exception 'Escreva seu pedido de oração.';
  end if;

  if v_visibility not in ('PASTORAL','PRAYER_TEAM') then
    raise exception 'Privacidade inválida.';
  end if;

  v_person_id := app_private.current_person_id(p_organization_id);
  if v_person_id is null then
    raise exception 'Pessoa vinculada não encontrada';
  end if;

  insert into public.prayer_requests(
    organization_id,person_id,auth_user_id,message,visibility
  )
  values(
    p_organization_id,v_person_id,auth.uid(),trim(p_message),v_visibility
  )
  returning id into v_id;

  for v_recipient in
    select distinct p.auth_user_id, p.id as person_id
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
    join public.role_permissions rp
      on rp.role_id=r.id
     and rp.permission_key='care.manage'
    where p.organization_id=p_organization_id
      and p.record_status='active'
      and p.auth_user_id is not null
      and p.auth_user_id<>auth.uid()
  loop
    perform app_private.enqueue_notification(
      p_organization_id,
      v_recipient.auth_user_id,
      v_recipient.person_id,
      'care',
      'Novo pedido de oração',
      'Há um novo pedido de oração aguardando acompanhamento.',
      jsonb_build_object('type','prayer_request','request_id',v_id),
      'prayer.created:'||v_id::text||':'||v_recipient.auth_user_id::text
    );
  end loop;

  return v_id;
end;
$$;

create or replace function public.list_my_prayer_requests(
  p_organization_id uuid
)
returns table(
  request_id uuid,
  message text,
  visibility text,
  status text,
  response_text text,
  responded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pr.id,
    pr.message,
    pr.visibility,
    pr.status,
    pr.response_text,
    pr.responded_at,
    pr.created_at,
    pr.updated_at
  from public.prayer_requests pr
  where pr.organization_id=p_organization_id
    and pr.auth_user_id=auth.uid()
    and app_private.is_org_member(p_organization_id)
  order by pr.created_at desc;
$$;

create or replace function public.list_prayer_queue(
  p_organization_id uuid
)
returns table(
  request_id uuid,
  person_id uuid,
  person_name text,
  message text,
  visibility text,
  status text,
  response_text text,
  responded_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(p_organization_id,'care.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  return query
  select
    pr.id,
    pr.person_id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    pr.message,
    pr.visibility,
    pr.status,
    pr.response_text,
    pr.responded_at,
    pr.created_at
  from public.prayer_requests pr
  join public.people p
    on p.id=pr.person_id
   and p.organization_id=pr.organization_id
  where pr.organization_id=p_organization_id
  order by
    case pr.status
      when 'RECEIVED' then 1
      when 'IN_PRAYER' then 2
      when 'ANSWERED' then 3
      else 4
    end,
    pr.created_at desc;
end;
$$;

create or replace function public.set_prayer_request_status(
  p_request_id uuid,
  p_status text,
  p_response_text text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.prayer_requests%rowtype;
  v_org_id uuid;
  v_person_id uuid;
  v_status text := upper(trim(coalesce(p_status,'')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_request
  from public.prayer_requests
  where id=p_request_id;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  v_org_id := v_request.organization_id;

  if not app_private.has_permission(v_org_id,'care.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_status not in ('RECEIVED','IN_PRAYER','ANSWERED','CLOSED') then
    raise exception 'Status inválido';
  end if;

  v_person_id := app_private.current_person_id(v_org_id);

  update public.prayer_requests
  set status=v_status,
      response_text=case
        when nullif(trim(coalesce(p_response_text,'')),'') is not null
          then trim(p_response_text)
        else response_text
      end,
      responded_by_person_id=case
        when v_status in ('ANSWERED','CLOSED') then v_person_id
        else responded_by_person_id
      end,
      responded_at=case
        when v_status in ('ANSWERED','CLOSED') then now()
        else responded_at
      end,
      updated_at=now()
  where id=p_request_id;

  perform app_private.enqueue_notification(
    v_org_id,
    v_request.auth_user_id,
    v_request.person_id,
    'care',
    case v_status
      when 'IN_PRAYER' then 'Seu pedido está sendo acompanhado'
      when 'ANSWERED' then 'Seu pedido de oração recebeu uma resposta'
      when 'CLOSED' then 'Pedido de oração concluído'
      else 'Atualização no seu pedido de oração'
    end,
    case
      when nullif(trim(coalesce(p_response_text,'')),'') is not null
        then left(trim(p_response_text),800)
      when v_status='IN_PRAYER'
        then 'Sua igreja registrou que este pedido está em acompanhamento.'
      else 'Há uma atualização no seu pedido de oração.'
    end,
    jsonb_build_object('type','prayer_request','request_id',p_request_id,'status',v_status),
    'prayer.status:'||p_request_id::text||':'||v_status
  );

  return true;
end;
$$;

create or replace function public.create_pastoral_request(
  p_organization_id uuid,
  p_reason text,
  p_availability_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_id uuid;
  v_recipient record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.is_org_member(p_organization_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Informe brevemente o motivo do atendimento.';
  end if;

  v_person_id := app_private.current_person_id(p_organization_id);
  if v_person_id is null then
    raise exception 'Pessoa vinculada não encontrada';
  end if;

  insert into public.pastoral_requests(
    organization_id,person_id,auth_user_id,reason,availability_notes
  )
  values(
    p_organization_id,
    v_person_id,
    auth.uid(),
    trim(p_reason),
    nullif(trim(coalesce(p_availability_notes,'')),'')
  )
  returning id into v_id;

  for v_recipient in
    select distinct p.auth_user_id, p.id as person_id
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
    join public.role_permissions rp
      on rp.role_id=r.id
     and rp.permission_key='care.manage'
    where p.organization_id=p_organization_id
      and p.record_status='active'
      and p.auth_user_id is not null
      and p.auth_user_id<>auth.uid()
  loop
    perform app_private.enqueue_notification(
      p_organization_id,
      v_recipient.auth_user_id,
      v_recipient.person_id,
      'care',
      'Novo pedido de atendimento pastoral',
      'Há uma solicitação aguardando definição de horário.',
      jsonb_build_object('type','pastoral_request','request_id',v_id),
      'pastoral.created:'||v_id::text||':'||v_recipient.auth_user_id::text
    );
  end loop;

  return v_id;
end;
$$;

create or replace function public.list_my_pastoral_requests(
  p_organization_id uuid
)
returns table(
  request_id uuid,
  reason text,
  availability_notes text,
  status text,
  proposed_start_at timestamptz,
  proposed_end_at timestamptz,
  proposal_note text,
  member_response_note text,
  member_responded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.reason,
    r.availability_notes,
    r.status,
    r.proposed_start_at,
    r.proposed_end_at,
    r.proposal_note,
    r.member_response_note,
    r.member_responded_at,
    r.completed_at,
    r.created_at,
    r.updated_at
  from public.pastoral_requests r
  where r.organization_id=p_organization_id
    and r.auth_user_id=auth.uid()
    and app_private.is_org_member(p_organization_id)
  order by r.created_at desc;
$$;

create or replace function public.list_pastoral_queue(
  p_organization_id uuid
)
returns table(
  request_id uuid,
  person_id uuid,
  person_name text,
  reason text,
  availability_notes text,
  status text,
  proposed_start_at timestamptz,
  proposed_end_at timestamptz,
  proposal_note text,
  member_response_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(p_organization_id,'care.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  return query
  select
    r.id,
    r.person_id,
    coalesce(nullif(p.preferred_name,''),p.full_name),
    r.reason,
    r.availability_notes,
    r.status,
    r.proposed_start_at,
    r.proposed_end_at,
    r.proposal_note,
    r.member_response_note,
    r.created_at,
    r.updated_at
  from public.pastoral_requests r
  join public.people p
    on p.id=r.person_id
   and p.organization_id=r.organization_id
  where r.organization_id=p_organization_id
  order by
    case r.status
      when 'REQUESTED' then 1
      when 'RESCHEDULE_REQUESTED' then 2
      when 'PROPOSED' then 3
      when 'CONFIRMED' then 4
      when 'COMPLETED' then 5
      else 6
    end,
    coalesce(r.proposed_start_at,r.created_at);
end;
$$;

create or replace function public.propose_pastoral_appointment(
  p_request_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.pastoral_requests%rowtype;
  v_person_id uuid;
  v_end_at timestamptz := coalesce(p_end_at,p_start_at+interval '60 minutes');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_request
  from public.pastoral_requests
  where id=p_request_id;

  if not found then
    raise exception 'Solicitação não encontrada';
  end if;

  if not app_private.has_permission(v_request.organization_id,'care.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if p_start_at is null or p_start_at<=now() then
    raise exception 'Escolha uma data futura';
  end if;

  if v_end_at<=p_start_at then
    raise exception 'Horário final inválido';
  end if;

  v_person_id := app_private.current_person_id(v_request.organization_id);

  update public.pastoral_requests
  set status='PROPOSED',
      proposed_start_at=p_start_at,
      proposed_end_at=v_end_at,
      proposed_by_person_id=v_person_id,
      proposal_note=nullif(trim(coalesce(p_note,'')),''),
      member_response_note=null,
      member_responded_at=null,
      updated_at=now()
  where id=p_request_id;

  perform app_private.enqueue_notification(
    v_request.organization_id,
    v_request.auth_user_id,
    v_request.person_id,
    'care',
    'Horário proposto para seu atendimento',
    'A liderança pastoral propôs '||
      to_char(p_start_at at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI')||
      '. Abra o Elo para aceitar ou pedir outro horário.',
    jsonb_build_object(
      'type','pastoral_request',
      'request_id',p_request_id,
      'status','PROPOSED',
      'starts_at',p_start_at
    ),
    'pastoral.proposed:'||p_request_id::text||':'||extract(epoch from p_start_at)::bigint::text
  );

  return true;
end;
$$;

create or replace function public.respond_pastoral_proposal(
  p_request_id uuid,
  p_accept boolean,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.pastoral_requests%rowtype;
  v_recipient record;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_request
  from public.pastoral_requests
  where id=p_request_id
    and auth_user_id=auth.uid();

  if not found then
    raise exception 'Solicitação não encontrada';
  end if;

  if v_request.status<>'PROPOSED' then
    raise exception 'Esta solicitação não possui uma proposta pendente';
  end if;

  v_status := case when p_accept then 'CONFIRMED' else 'RESCHEDULE_REQUESTED' end;

  update public.pastoral_requests
  set status=v_status,
      member_response_note=nullif(trim(coalesce(p_note,'')),''),
      member_responded_at=now(),
      updated_at=now()
  where id=p_request_id;

  for v_recipient in
    select distinct p.auth_user_id, p.id as person_id
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
    join public.role_permissions rp
      on rp.role_id=r.id
     and rp.permission_key='care.manage'
    where p.organization_id=v_request.organization_id
      and p.record_status='active'
      and p.auth_user_id is not null
  loop
    perform app_private.enqueue_notification(
      v_request.organization_id,
      v_recipient.auth_user_id,
      v_recipient.person_id,
      'care',
      case when p_accept
        then 'Atendimento confirmado pelo membro'
        else 'Membro pediu outro horário'
      end,
      case when p_accept
        then 'O horário proposto foi aceito.'
        else 'A proposta de horário precisa ser revista.'
      end,
      jsonb_build_object(
        'type','pastoral_request',
        'request_id',p_request_id,
        'status',v_status
      ),
      'pastoral.response:'||p_request_id::text||':'||v_status||':'||v_recipient.auth_user_id::text
    );
  end loop;

  return true;
end;
$$;

create or replace function public.complete_pastoral_appointment(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.pastoral_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select * into v_request
  from public.pastoral_requests
  where id=p_request_id;

  if not found then
    raise exception 'Solicitação não encontrada';
  end if;

  if not app_private.has_permission(v_request.organization_id,'care.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  update public.pastoral_requests
  set status='COMPLETED',
      completed_at=now(),
      updated_at=now()
  where id=p_request_id;

  perform app_private.enqueue_notification(
    v_request.organization_id,
    v_request.auth_user_id,
    v_request.person_id,
    'care',
    'Atendimento pastoral concluído',
    'Seu atendimento foi marcado como concluído.',
    jsonb_build_object('type','pastoral_request','request_id',p_request_id,'status','COMPLETED'),
    'pastoral.completed:'||p_request_id::text
  );

  return true;
end;
$$;

create or replace function public.get_member_contribution_info(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.is_org_member(p_organization_id)
     or not app_private.has_permission(p_organization_id,'contributions.create',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select jsonb_build_object(
    'enabled',s.enabled,
    'pix_key_type',s.pix_key_type,
    'pix_key',s.pix_key,
    'pix_copy_paste',s.pix_copy_paste,
    'beneficiary_name',s.beneficiary_name,
    'bank_name',s.bank_name,
    'instructions',s.instructions
  )
  into v_result
  from public.organization_contribution_settings s
  where s.organization_id=p_organization_id
    and s.enabled=true;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

create or replace function public.save_contribution_settings(
  p_organization_id uuid,
  p_enabled boolean,
  p_pix_key_type text default null,
  p_pix_key text default null,
  p_pix_copy_paste text default null,
  p_beneficiary_name text default null,
  p_bank_name text default null,
  p_instructions text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := upper(nullif(trim(coalesce(p_pix_key_type,'')),''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not (
    app_private.has_permission(p_organization_id,'finance.manage',null)
    or app_private.has_permission(p_organization_id,'organization.manage',null)
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if v_type is not null and v_type not in ('CPF','CNPJ','EMAIL','PHONE','RANDOM','COPY_PASTE') then
    raise exception 'Tipo de chave Pix inválido';
  end if;

  if p_enabled
     and nullif(trim(coalesce(p_pix_key,'')),'') is null
     and nullif(trim(coalesce(p_pix_copy_paste,'')),'') is null then
    raise exception 'Informe uma chave Pix ou código copia e cola';
  end if;

  insert into public.organization_contribution_settings(
    organization_id,enabled,pix_key_type,pix_key,pix_copy_paste,
    beneficiary_name,bank_name,instructions,updated_by_user_id
  )
  values(
    p_organization_id,p_enabled,v_type,
    nullif(trim(coalesce(p_pix_key,'')),''),
    nullif(trim(coalesce(p_pix_copy_paste,'')),''),
    nullif(trim(coalesce(p_beneficiary_name,'')),''),
    nullif(trim(coalesce(p_bank_name,'')),''),
    nullif(trim(coalesce(p_instructions,'')),''),
    auth.uid()
  )
  on conflict (organization_id) do update
  set enabled=excluded.enabled,
      pix_key_type=excluded.pix_key_type,
      pix_key=excluded.pix_key,
      pix_copy_paste=excluded.pix_copy_paste,
      beneficiary_name=excluded.beneficiary_name,
      bank_name=excluded.bank_name,
      instructions=excluded.instructions,
      updated_by_user_id=auth.uid(),
      updated_at=now();

  return true;
end;
$$;

revoke all on function public.create_prayer_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_prayer_request(uuid,text,text) to authenticated;
revoke all on function public.list_my_prayer_requests(uuid) from public,anon,authenticated;
grant execute on function public.list_my_prayer_requests(uuid) to authenticated;
revoke all on function public.list_prayer_queue(uuid) from public,anon,authenticated;
grant execute on function public.list_prayer_queue(uuid) to authenticated;
revoke all on function public.set_prayer_request_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_prayer_request_status(uuid,text,text) to authenticated;

revoke all on function public.create_pastoral_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_pastoral_request(uuid,text,text) to authenticated;
revoke all on function public.list_my_pastoral_requests(uuid) from public,anon,authenticated;
grant execute on function public.list_my_pastoral_requests(uuid) to authenticated;
revoke all on function public.list_pastoral_queue(uuid) from public,anon,authenticated;
grant execute on function public.list_pastoral_queue(uuid) to authenticated;
revoke all on function public.propose_pastoral_appointment(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.propose_pastoral_appointment(uuid,timestamptz,timestamptz,text) to authenticated;
revoke all on function public.respond_pastoral_proposal(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.respond_pastoral_proposal(uuid,boolean,text) to authenticated;
revoke all on function public.complete_pastoral_appointment(uuid) from public,anon,authenticated;
grant execute on function public.complete_pastoral_appointment(uuid) to authenticated;

revoke all on function public.get_member_contribution_info(uuid) from public,anon,authenticated;
grant execute on function public.get_member_contribution_info(uuid) to authenticated;
revoke all on function public.save_contribution_settings(uuid,boolean,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_contribution_settings(uuid,boolean,text,text,text,text,text,text) to authenticated;
