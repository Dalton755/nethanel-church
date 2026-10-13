-- Sandbox Demo: contribuição Pix mensal MANUAL, sem débito automático e sem mexer em assinaturas.
-- Cada mês tem um QR próprio, vinculado a uma única oferta voluntária.
create table if not exists public.elo_developer_monthly_pix_cycles (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.elo_developer_donations(id) on delete restrict,
  month_period date not null check (extract(day from month_period)=1),
  amount_cents integer not null check(amount_cents between 500 and 5000000),
  status text not null default 'processing'
    check (status in ('processing','pending','paid','refunded','canceled','failed')),
  provider_qr_id text unique,
  pix_payload text,
  pix_expires_at timestamptz,
  provider_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(donation_id,month_period)
);
create index if not exists elo_developer_monthly_pix_cycles_donation_idx
  on public.elo_developer_monthly_pix_cycles(donation_id,month_period desc);
alter table public.elo_developer_monthly_pix_cycles enable row level security;
revoke all on public.elo_developer_monthly_pix_cycles from public,anon,authenticated;
grant select,insert,update,delete on public.elo_developer_monthly_pix_cycles to service_role;

-- Um plano manual ativo por conta, valor e igreja. Sem cobrança automática.
create unique index if not exists elo_developer_monthly_pix_active_pledge_uidx
on public.elo_developer_donations(organization_id,requested_by,amount_cents)
where environment='sandbox' and frequency='monthly' and payment_method='pix'
 and checkout_url is null and status in ('draft','processing','pending','paid');

create or replace function public.request_elo_monthly_pix_pledge(
 p_organization_id uuid, p_amount_cents integer
) returns jsonb
language plpgsql security definer set search_path to pg_catalog,public,app_private
as $$
declare d public.elo_developer_donations%rowtype;
begin
 if p_organization_id <> '101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid
    or not app_private.can_manage_elo_donation(p_organization_id) then
  raise exception 'Acesso negado ao Sandbox de ofertas.' using errcode='42501';
 end if;
 if p_amount_cents not between 500 and 5000000 then
  raise exception 'Valor inválido para oferta.' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtext((select auth.uid())::text),
   hashtext(p_organization_id::text||p_amount_cents::text||':monthly-pix'));
 select * into d from public.elo_developer_donations
 where organization_id=p_organization_id and requested_by=(select auth.uid())
   and amount_cents=p_amount_cents and frequency='monthly'
   and payment_method='pix' and environment='sandbox'
   and checkout_url is null and status in ('draft','processing','pending','paid')
 order by created_at desc limit 1;
 if not found then
  if (select count(*) from public.elo_developer_donations
      where requested_by=(select auth.uid()) and created_at>now()-interval '1 hour')>=5
  then
    raise exception 'Aguarde antes de criar outra oferta.' using errcode='22023';
  end if;
  insert into public.elo_developer_donations
    (organization_id,requested_by,amount_cents,frequency,payment_method,environment,status)
  values (p_organization_id,(select auth.uid()),p_amount_cents,'monthly','pix','sandbox','pending')
  returning * into d;
 end if;
 return jsonb_build_object('id',d.id,'amount_cents',d.amount_cents,
   'status',d.status,'frequency','monthly');
end;
$$;
revoke all on function public.request_elo_monthly_pix_pledge(uuid,integer)
 from public,anon;
grant execute on function public.request_elo_monthly_pix_pledge(uuid,integer)
 to authenticated;

-- Trava da geração do QR deste mês; retorna 'processing', 'pending' ou 'paid'.
-- PostgreSQL calcula o período na zona da igreja para evitar virada UTC equivocada.
create or replace function public.reserve_elo_monthly_pix_cycle(p_donation_id uuid)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,public,app_private
as $$
declare d public.elo_developer_donations%rowtype;
 c public.elo_developer_monthly_pix_cycles%rowtype;
 m date := date_trunc('month',now() at time zone 'America/Sao_Paulo')::date;
begin
 select * into d from public.elo_developer_donations
 where id=p_donation_id and requested_by=(select auth.uid())
 and organization_id='101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid
 and environment='sandbox' and payment_method='pix'
 and frequency='monthly' and checkout_url is null
 for update;
 if not found or not app_private.can_manage_elo_donation(d.organization_id)
 then raise exception 'Oferta mensal não autorizada.' using errcode='42501'; end if;
 if d.status='canceled' then return jsonb_build_object('state','canceled','id',d.id); end if;
 if d.status not in ('draft','processing','pending','paid')
 then raise exception 'Oferta mensal indisponível.' using errcode='22023'; end if;

 select * into c from public.elo_developer_monthly_pix_cycles
 where donation_id=d.id and month_period=m for update;
 if not found then
  insert into public.elo_developer_monthly_pix_cycles
   (donation_id,month_period,amount_cents,status)
  values (d.id,m,d.amount_cents,'processing') returning * into c;
  return jsonb_build_object('state','new','id',d.id,
    'cycleId',c.id,'month',c.month_period,'amountCents',c.amount_cents);
 end if;
 if c.status='paid' then
  return jsonb_build_object('state','paid','id',d.id,'cycleId',c.id,
    'month',m,'amountCents',c.amount_cents);
 end if;
 if c.status='pending' and c.pix_payload is not null and
    c.pix_expires_at>now() then
  return jsonb_build_object('state','pending','id',d.id,'cycleId',c.id,
    'month',m,'amountCents',c.amount_cents,
    'pixPayload',c.pix_payload,'expiresAt',c.pix_expires_at);
 end if;
 if c.status='processing' and c.updated_at>now()-interval '2 minutes' then
  return jsonb_build_object('state','processing','id',d.id,'cycleId',c.id,
    'month',m,'amountCents',c.amount_cents);
 end if;
 if c.status='canceled' then
  return jsonb_build_object('state','canceled','id',d.id,'cycleId',c.id,
    'month',m,'amountCents',c.amount_cents);
 end if;
 -- Somente renova QR que expirou ou processamento abandonado.
 update public.elo_developer_monthly_pix_cycles set
  status='processing',pix_payload=null,provider_qr_id=null,
  pix_expires_at=null,updated_at=now()
 where id=c.id;
 return jsonb_build_object('state','new','id',d.id,'cycleId',c.id,
    'month',m,'amountCents',c.amount_cents);
end;
$$;
revoke all on function public.reserve_elo_monthly_pix_cycle(uuid) from public,anon;
grant execute on function public.reserve_elo_monthly_pix_cycle(uuid) to authenticated;

-- O histórico jamais devolve o payload Pix; só a rota autenticada consulta o QR.
create or replace function public.list_my_elo_developer_donations(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,public,app_private
as $$
declare v_result jsonb;
begin
 if not app_private.can_manage_elo_donation(p_organization_id)
 then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'amount_cents',d.amount_cents,'frequency',d.frequency,
  'payment_method',d.payment_method,'status',d.status,'created_at',d.created_at,
  'checkout_url',d.checkout_url,
  'can_cancel', d.frequency='monthly' and d.status<>'canceled' and
     (d.provider_subscription_id is not null or
       (d.payment_method='pix' and d.checkout_url is null)),
  'monthly_cycles',coalesce((
    select jsonb_agg(jsonb_build_object(
      'month',c.month_period,'status',c.status,'paid_at',c.paid_at)
      order by c.month_period desc)
    from (select month_period,status,paid_at
      from public.elo_developer_monthly_pix_cycles
      where donation_id=d.id order by month_period desc limit 12) c
  ),'[]'::jsonb)
 ) order by d.created_at desc),'[]'::jsonb)
 into v_result from (
  select * from public.elo_developer_donations
  where organization_id=p_organization_id and requested_by=(select auth.uid())
  order by created_at desc limit 30
 ) d;
 return v_result;
end;
$$;
revoke all on function public.list_my_elo_developer_donations(uuid) from public,anon;
grant execute on function public.list_my_elo_developer_donations(uuid) to authenticated;

-- Eventos gerados pelo Asaas com token do webhook (chamado somente por service_role).
create or replace function public.elo_apply_developer_monthly_pix_event(
 p_cycle_id uuid,p_event_key text,p_provider_payment_id text,
 p_status text,p_amount_cents integer
) returns boolean language plpgsql security definer
set search_path to pg_catalog,public,app_private
as $$
declare c public.elo_developer_monthly_pix_cycles%rowtype;
 d public.elo_developer_donations%rowtype;
 v_added uuid;
begin
 if length(coalesce(p_event_key,'')) not between 5 and 250 or
    length(coalesce(p_provider_payment_id,'')) not between 5 and 150 or
    p_status not in ('pending','paid','refunded','overdue','canceled')
 then raise exception 'Evento inválido.' using errcode='22023'; end if;
 select * into c from public.elo_developer_monthly_pix_cycles
 where id=p_cycle_id for update;
 if not found or c.amount_cents<>p_amount_cents or
   c.status not in ('pending','paid','refunded','canceled')
 then raise exception 'Período mensal inválido.' using errcode='22023'; end if;
 select * into d from public.elo_developer_donations
 where id=c.donation_id and frequency='monthly' and payment_method='pix'
   and environment='sandbox'
   and organization_id='101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid
 for update;
 if not found then raise exception 'Oferta inválida.' using errcode='22023'; end if;
 insert into public.elo_developer_donation_events
  (donation_id,event_key,provider_payment_id,amount_cents,status)
 values (d.id,p_event_key,p_provider_payment_id,p_amount_cents,p_status)
 on conflict(event_key) do nothing returning id into v_added;
 if v_added is null then return false; end if;

 update public.elo_developer_monthly_pix_cycles set
  status=case when p_status='paid' then 'paid'
              when p_status='refunded' and status='paid' then 'refunded'
              else status end,
  provider_payment_id=case when p_status='paid' then p_provider_payment_id
    else provider_payment_id end,
  paid_at=case when p_status='paid' then now() else paid_at end,
  updated_at=now() where id=c.id;
 update public.elo_developer_donations set
  status=case when status='canceled' then 'canceled'
    when p_status='paid' then 'paid' else status end,
  last_payment_at=case when p_status='paid' then now()
    else last_payment_at end,
  updated_at=now() where id=d.id;
 return true;
end;
$$;
revoke all on function public.elo_apply_developer_monthly_pix_event(uuid,text,text,text,integer)
 from public,anon,authenticated;
grant execute on function public.elo_apply_developer_monthly_pix_event(uuid,text,text,text,integer)
 to service_role;
notify pgrst,'reload schema';
