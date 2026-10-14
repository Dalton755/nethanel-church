-- PREVIEW ONLY: NAO APLICAR. Piloto Pix REAL desativado por codigo e sem novos Webhooks.
-- Tabelas e RPCs isolados das ofertas Sandbox e do faturamento antigo da igreja.
-- Antes de aplicar, exigir revisao de concorrencia, duplicidade e autorizacao explicita.
create table if not exists public.elo_prod_offering_intents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 requested_by uuid not null references auth.users(id) on delete restrict,
 amount_cents integer not null check (amount_cents between 500 and 5000000),
 frequency text not null check (frequency in ('once','monthly')),
 state text not null default 'active' check (state in ('active','canceled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists elo_prod_one_active_monthly_per_value
 on public.elo_prod_offering_intents (organization_id,requested_by,amount_cents)
 where frequency='monthly' and state='active';
create index if not exists elo_prod_offerings_owner_created
 on public.elo_prod_offering_intents(organization_id,requested_by,created_at desc);
alter table public.elo_prod_offering_intents enable row level security;
revoke all on public.elo_prod_offering_intents from public,anon,authenticated;
grant select,insert,update on public.elo_prod_offering_intents to service_role;

create table if not exists public.elo_prod_pix_cycles (
 id uuid primary key default gen_random_uuid(),
 intent_id uuid not null references public.elo_prod_offering_intents(id) on delete restrict,
 period date not null,
 amount_cents integer not null check (amount_cents between 500 and 5000000),
 state text not null default 'processing'
   check(state in ('processing','pending','paid','refunded','canceled','failed')),
 provider_qr_id text unique,
 pix_payload text,
 expires_at timestamptz,
 provider_payment_id text unique,
 paid_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(intent_id,period),
 check (state <> 'pending' or
   (provider_qr_id is not null and pix_payload is not null and expires_at is not null))
);
create index if not exists elo_prod_cycle_intent_period
 on public.elo_prod_pix_cycles (intent_id,period desc);
alter table public.elo_prod_pix_cycles enable row level security;
revoke all on public.elo_prod_pix_cycles from public,anon,authenticated;
grant select,insert,update on public.elo_prod_pix_cycles to service_role;

create table if not exists public.elo_prod_pix_events (
 id uuid primary key default gen_random_uuid(),
 cycle_id uuid not null references public.elo_prod_pix_cycles(id) on delete restrict,
 provider_event_id text not null unique,
 provider_payment_id text not null,
 event_type text not null,
 result_state text not null check(result_state in ('pending','paid','refunded','canceled')),
 amount_cents integer not null,
 received_at timestamptz not null default now()
);
alter table public.elo_prod_pix_events enable row level security;
revoke all on public.elo_prod_pix_events from public,anon,authenticated;
grant select,insert on public.elo_prod_pix_events to service_role;

-- Dupla verificacao: admin global + direito ministerial vinculado a igreja Demo.
-- Mesmo que o endpoint seja liberado por engano, outras igrejas ficam vedadas.
create or replace function app_private.can_manage_elo_prod_offering(p_org uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
 select p_org='101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid
 and (select auth.uid()) is not null
 and exists(select 1 from public.platform_admins pa
            where pa.user_id=(select auth.uid()) and pa.active)
 and exists(
   select 1 from public.people p
   join public.organization_memberships m
     on m.organization_id=p.organization_id and m.person_id=p.id and m.status='active'
   join public.user_role_assignments ura on ura.person_id=p.id
      and ura.organization_id=p.organization_id and ura.is_active
      and (ura.starts_at is null or ura.starts_at<=now())
      and (ura.ends_at is null or ura.ends_at>now())
   join public.roles r on r.id=ura.role_id and r.organization_id=p.organization_id
      and r.is_active
   where p.organization_id=p_org and p.auth_user_id=(select auth.uid())
     and p.record_status='active'
     and (r.is_owner or lower(r.role_key) in ('owner','admin','pastor','tesoureiro'))
 );
$$;
revoke all on function app_private.can_manage_elo_prod_offering(uuid) from public,anon;
grant execute on function app_private.can_manage_elo_prod_offering(uuid) to authenticated;

create or replace function public.request_elo_prod_offering(
 p_organization_id uuid,p_amount_cents integer,p_frequency text
) returns jsonb language plpgsql security definer
set search_path to pg_catalog,public,app_private
as $$
declare d public.elo_prod_offering_intents%rowtype;
begin
 if not app_private.can_manage_elo_prod_offering(p_organization_id)
 then raise exception 'Piloto indisponível para este usuário/igreja' using errcode='42501'; end if;
 if p_amount_cents not between 500 and 5000000 or p_frequency not in ('once','monthly')
 then raise exception 'Oferta inválida' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext((select auth.uid())::text),
   hashtext(p_organization_id::text||p_amount_cents::text||p_frequency));
 select * into d from public.elo_prod_offering_intents
 where organization_id=p_organization_id and requested_by=(select auth.uid())
 and amount_cents=p_amount_cents and frequency=p_frequency and state='active'
 and (p_frequency='monthly' or created_at > now()-interval '10 minutes')
 and (p_frequency='monthly' or not exists
   (select 1 from public.elo_prod_pix_cycles c where c.intent_id=id
      and c.state in ('paid','refunded','canceled','failed')))
 order by created_at desc limit 1;
 if not found then
  if (select count(*) from public.elo_prod_offering_intents
     where requested_by=(select auth.uid()) and created_at>now()-interval '1 hour')>=5
  then raise exception 'Aguarde antes de gerar outra oferta' using errcode='22023'; end if;
  insert into public.elo_prod_offering_intents
    (organization_id,requested_by,amount_cents,frequency)
  values (p_organization_id,(select auth.uid()),p_amount_cents,p_frequency)
  returning * into d;
 end if;
 return jsonb_build_object('id',d.id,'frequency',d.frequency,'amountCents',d.amount_cents);
end;
$$;
revoke all on function public.request_elo_prod_offering(uuid,integer,text)
 from public,anon;
grant execute on function public.request_elo_prod_offering(uuid,integer,text)
 to authenticated;

create or replace function public.reserve_elo_prod_pix_cycle(p_intent_id uuid)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,public,app_private
as $$
declare d public.elo_prod_offering_intents%rowtype;
 c public.elo_prod_pix_cycles%rowtype;
 m date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
begin
 select * into d from public.elo_prod_offering_intents
 where id=p_intent_id and requested_by=(select auth.uid()) for update;
 if not found or not app_private.can_manage_elo_prod_offering(d.organization_id)
 then raise exception 'Oferta não autorizada' using errcode='42501'; end if;
 if d.state='canceled' then return jsonb_build_object('state','canceled'); end if;

 select * into c from public.elo_prod_pix_cycles
 where intent_id=d.id and period=m for update;
 if not found then
  insert into public.elo_prod_pix_cycles(intent_id,period,amount_cents)
  values (d.id,m,d.amount_cents) returning * into c;
  return jsonb_build_object('state','new','cycleId',c.id,
      'amountCents',c.amount_cents,'month',m);
 end if;
 if c.state='paid' or c.state='refunded' or c.state='canceled' then
  return jsonb_build_object('state',c.state,'cycleId',c.id,'month',m);
 end if;
 if c.state='pending' and c.pix_payload is not null and c.expires_at>now() then
  return jsonb_build_object('state','pending','cycleId',c.id,'month',m,
   'amountCents',c.amount_cents,'pixPayload',c.pix_payload,'expiresAt',c.expires_at);
 end if;
 if c.state='processing' and c.updated_at>now()-interval '3 minutes' then
  return jsonb_build_object('state','processing','cycleId',c.id,'month',m);
 end if;
 -- Atualização de QR SOMENTE depois da expiração original.
 -- Em falha de criação, status failed pode ser tentado novamente.
 if c.state='pending' and c.expires_at>now()
 then raise exception 'Pix anterior ainda válido' using errcode='22023'; end if;
 update public.elo_prod_pix_cycles set state='processing',
    provider_qr_id=null,pix_payload=null,expires_at=null,updated_at=now()
 where id=c.id;
 return jsonb_build_object('state','new','cycleId',c.id,
      'amountCents',c.amount_cents,'month',m);
end;
$$;
revoke all on function public.reserve_elo_prod_pix_cycle(uuid) from public,anon;
grant execute on function public.reserve_elo_prod_pix_cycle(uuid) to authenticated;

create or replace function public.commit_elo_prod_pix_qr(
 p_intent_id uuid,p_cycle_id uuid,p_provider_qr_id text,
 p_payload text,p_expires_at timestamptz
) returns boolean language plpgsql security definer
set search_path to pg_catalog,public,app_private
as $$
declare d public.elo_prod_offering_intents%rowtype;
 c public.elo_prod_pix_cycles%rowtype;
begin
 if (select auth.role())<>'service_role' then raise exception 'Acesso negado' using errcode='42501'; end if;
 if length(coalesce(p_provider_qr_id,'')) not between 5 and 150 or
    length(coalesce(p_payload,'')) not between 30 and 2000 or
    p_expires_at<=now() or p_expires_at>now()+interval '2 days'
 then raise exception 'Dados Pix inválidos' using errcode='22023'; end if;
 select * into d from public.elo_prod_offering_intents where id=p_intent_id for update;
 if not found or d.state <> 'active' or
    d.organization_id<>'101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid
 then return false; end if;
 select * into c from public.elo_prod_pix_cycles where id=p_cycle_id
  and intent_id=d.id for update;
 if not found or c.state<>'processing' then return false; end if;
 update public.elo_prod_pix_cycles set
   state='pending',provider_qr_id=p_provider_qr_id,pix_payload=p_payload,
   expires_at=p_expires_at,updated_at=now()
 where id=c.id;
 return true;
end;
$$;
revoke all on function public.commit_elo_prod_pix_qr(uuid,uuid,text,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.commit_elo_prod_pix_qr(uuid,uuid,text,text,timestamptz)
 to service_role;

create or replace function public.cancel_elo_prod_monthly(p_intent_id uuid)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,public,app_private
as $$
declare d public.elo_prod_offering_intents%rowtype;
 v_qr_ids jsonb;
begin
 select * into d from public.elo_prod_offering_intents
 where id=p_intent_id and requested_by=(select auth.uid())
 and frequency='monthly' for update;
 if not found or not app_private.can_manage_elo_prod_offering(d.organization_id)
 then raise exception 'Oferta não autorizada' using errcode='42501'; end if;
 if d.state='canceled' then return jsonb_build_object('canceled',true,
   'alreadyCanceled',true,'qrIds','[]'::jsonb); end if;
 select coalesce(jsonb_agg(provider_qr_id),'[]'::jsonb) into v_qr_ids
 from public.elo_prod_pix_cycles
 where intent_id=d.id and state='pending' and provider_qr_id is not null;
 update public.elo_prod_offering_intents set state='canceled',updated_at=now()
 where id=d.id;
 update public.elo_prod_pix_cycles set state='canceled',updated_at=now()
 where intent_id=d.id and state in ('pending','processing');
 return jsonb_build_object('canceled',true,'alreadyCanceled',false,'qrIds',v_qr_ids);
end;
$$;
revoke all on function public.cancel_elo_prod_monthly(uuid) from public,anon;
grant execute on function public.cancel_elo_prod_monthly(uuid) to authenticated;

create or replace function public.list_my_elo_prod_offerings(p_org uuid)
returns jsonb language sql stable security definer
set search_path to pg_catalog,public,app_private
as $$
 select case when not app_private.can_manage_elo_prod_offering(p_org)
 then (select null::jsonb)
 else (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',d.id,'amountCents',d.amount_cents,
     'frequency',d.frequency,'state',d.state,
     'createdAt',d.created_at,
     'cycles',coalesce((
       select jsonb_agg(jsonb_build_object('month',c.period,
         'state',c.state,'paidAt',c.paid_at) order by c.period desc)
       from (select period,state,paid_at from public.elo_prod_pix_cycles
         where intent_id=d.id order by period desc limit 12) c
     ),'[]'::jsonb)
   ) order by d.created_at desc),'[]'::jsonb)
   from public.elo_prod_offering_intents d
   where d.organization_id=p_org and d.requested_by=(select auth.uid())
 )
 end;
$$;
revoke all on function public.list_my_elo_prod_offerings(uuid) from public,anon;
grant execute on function public.list_my_elo_prod_offerings(uuid) to authenticated;

create or replace function public.record_elo_prod_pix_event(
 p_cycle_id uuid,p_qr_id text,p_event_id text,p_payment_id text,
 p_event_type text,p_state text,p_amount_cents integer
) returns boolean language plpgsql security definer
set search_path to pg_catalog,public,app_private
as $$
declare d public.elo_prod_offering_intents%rowtype;
 c public.elo_prod_pix_cycles%rowtype;
 v_intent uuid;
 v_new uuid;
begin
 if (select auth.role())<>'service_role' then raise exception 'Acesso negado' using errcode='42501'; end if;
 if length(coalesce(p_event_id,'')) not between 5 and 150
    or length(coalesce(p_payment_id,'')) not between 5 and 150
    or p_state not in ('pending','paid','refunded','canceled')
    or p_event_type not in ('PAYMENT_CREATED','PAYMENT_UPDATED',
      'PAYMENT_RECEIVED','PAYMENT_CONFIRMED','PAYMENT_REFUNDED','PAYMENT_DELETED')
 then raise exception 'Evento não reconhecido' using errcode='22023'; end if;
 -- Mesma ordem de locks em commit/cancelamento/webhook: oferta primeiro, ciclo depois.
 select intent_id into v_intent from public.elo_prod_pix_cycles where id=p_cycle_id;
 if v_intent is null then raise exception 'QR não encontrado' using errcode='22023'; end if;
 select * into d from public.elo_prod_offering_intents where id=v_intent for update;
 select * into c from public.elo_prod_pix_cycles where id=p_cycle_id for update;
 if not found or d.organization_id<>'101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid
    or c.amount_cents<>p_amount_cents or c.provider_qr_id is distinct from p_qr_id
 then raise exception 'Evento/valor/QR de outra oferta' using errcode='22023'; end if;
 if c.provider_payment_id is not null and c.provider_payment_id<>p_payment_id
 then raise exception 'Outro pagamento para o mesmo QR' using errcode='22023'; end if;
 -- Persistir identificador recebido antes de confirmar qualquer pagamento.
 insert into public.elo_prod_pix_events(
   cycle_id,provider_event_id,provider_payment_id,event_type,result_state,amount_cents)
 values(p_cycle_id,p_event_id,p_payment_id,p_event_type,p_state,p_amount_cents)
 on conflict(provider_event_id) do nothing returning id into v_new;
 if v_new is null then return false; end if;
 if p_state='paid' and c.state not in ('paid','refunded') then
  update public.elo_prod_pix_cycles set state='paid',
    provider_payment_id=p_payment_id,paid_at=now(),updated_at=now() where id=c.id;
 elsif p_state='refunded' and c.state='paid' and c.provider_payment_id=p_payment_id then
  update public.elo_prod_pix_cycles set state='refunded',updated_at=now() where id=c.id;
 elsif p_state='canceled' and c.state='pending' then
  update public.elo_prod_pix_cycles set state='canceled',updated_at=now() where id=c.id;
 end if;
 return true;
end;
$$;
revoke all on function public.record_elo_prod_pix_event(uuid,text,text,text,text,text,integer)
 from public,anon,authenticated;
grant execute on function public.record_elo_prod_pix_event(uuid,text,text,text,text,text,integer)
 to service_role;

notify pgrst,'reload schema';
