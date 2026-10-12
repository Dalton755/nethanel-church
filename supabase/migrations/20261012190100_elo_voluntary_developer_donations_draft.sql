-- DRAFT ONLY. Nao aplicar em producao sem aprovacao explicita.
-- Contribuicoes VOLUNTARIAS ao desenvolvedor, completamente separadas
-- dos pagamentos de planos/assinaturas historicos das igrejas.
create table if not exists public.elo_developer_donations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 requested_by uuid not null references auth.users(id) on delete restrict,
 amount_cents integer not null check (amount_cents between 500 and 5000000),
 frequency text not null check (frequency in ('once','monthly')),
 payment_method text not null check (payment_method in ('pix','card','boleto')),
 provider text not null default 'asaas' check (provider='asaas'),
 environment text not null default 'sandbox' check(environment in ('sandbox','production')),
 status text not null default 'draft' check (
   status in ('draft','processing','pending','paid','canceled','failed','refunded')
 ),
 payment_link_id text unique,
 checkout_url text,
 provider_subscription_id text,
 last_payment_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists elo_developer_donations_org_created_idx
 on public.elo_developer_donations(organization_id,created_at desc);
create index if not exists elo_developer_donations_user_created_idx
 on public.elo_developer_donations(requested_by,created_at desc);
alter table public.elo_developer_donations enable row level security;
revoke all on public.elo_developer_donations from public,anon,authenticated;
grant select,insert,update,delete on public.elo_developer_donations to service_role;

create table if not exists public.elo_developer_donation_events (
 id uuid primary key default gen_random_uuid(),
 donation_id uuid not null references public.elo_developer_donations(id) on delete restrict,
 provider_payment_id text not null,
 event_key text not null,
 amount_cents integer not null check(amount_cents >= 0),
 status text not null,
 provider_subscription_id text,
 received_at timestamptz not null default now(),
 unique(event_key),
 unique(donation_id,provider_payment_id,status)
);
alter table public.elo_developer_donation_events enable row level security;
revoke all on public.elo_developer_donation_events from public,anon,authenticated;
grant select,insert,update,delete on public.elo_developer_donation_events to service_role;

create or replace function app_private.can_manage_elo_donation(p_organization_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
 select auth.uid() is not null and exists(
   select 1 from public.people p
   join public.organization_memberships m
     on m.person_id=p.id and m.organization_id=p.organization_id and m.status='active'
   join public.user_role_assignments ura
     on ura.person_id=p.id and ura.organization_id=p.organization_id and ura.is_active
     and (ura.starts_at is null or ura.starts_at<=now())
     and (ura.ends_at is null or ura.ends_at>now())
   join public.roles r on r.id=ura.role_id and r.is_active and r.organization_id=p.organization_id
   where p.organization_id=p_organization_id and p.auth_user_id=auth.uid()
     and p.record_status='active' and
     (r.is_owner or lower(r.role_key) in ('owner','admin','pastor','tesoureiro'))
 );
$$;
revoke all on function app_private.can_manage_elo_donation(uuid) from public,anon;
grant execute on function app_private.can_manage_elo_donation(uuid) to authenticated;

create or replace function public.request_elo_developer_donation(
 p_organization_id uuid, p_amount_cents integer,
 p_frequency text, p_payment_method text
) returns jsonb language plpgsql security definer
set search_path to pg_catalog,public,app_private
as $$
declare v_found public.elo_developer_donations%rowtype;
begin
 if not app_private.can_manage_elo_donation(p_organization_id) then
  raise exception 'Apenas pastores, administradores e tesoureiros podem ofertar.' using errcode='42501';
 end if;
 if p_amount_cents not between 500 and 5000000 or
 p_frequency not in ('once','monthly') or
 p_payment_method not in ('pix','card','boleto') then
  raise exception 'Valor, periodicidade ou pagamento invalidos.' using errcode='22023';
 end if;
 -- Evita cliques multiplos criando links e assinaturas duplicadas.
 perform pg_advisory_xact_lock(hashtext((select auth.uid())::text),hashtext(p_organization_id::text));
 select * into v_found from public.elo_developer_donations d
 where d.organization_id=p_organization_id and d.requested_by=(select auth.uid())
 and d.amount_cents=p_amount_cents and d.frequency=p_frequency
 and d.payment_method=p_payment_method
 and d.created_at>now()-interval '10 minutes'
 and d.status in ('draft','processing','pending')
 order by d.created_at desc limit 1;
 if not found then
   if (select count(*) from public.elo_developer_donations d
       where d.requested_by=(select auth.uid())
       and d.created_at>now()-interval '1 hour')>=5 then
     raise exception 'Limite temporario de tentativas. Aguarde antes de gerar nova oferta.' using errcode='22023';
   end if;
   insert into public.elo_developer_donations(
     organization_id,requested_by,amount_cents,frequency,payment_method
   ) values (
     p_organization_id,(select auth.uid()),p_amount_cents,p_frequency,p_payment_method
   ) returning * into v_found;
 end if;
 return jsonb_build_object('id',v_found.id,'status',v_found.status,
   'checkout_url',v_found.checkout_url,'frequency',v_found.frequency,
   'amount_cents',v_found.amount_cents);
end;
$$;
revoke all on function public.request_elo_developer_donation(uuid,integer,text,text) from public,anon;
grant execute on function public.request_elo_developer_donation(uuid,integer,text,text) to authenticated;

create or replace function public.list_my_elo_developer_donations(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,public,app_private
as $$
declare v_result jsonb;
begin
 if not app_private.can_manage_elo_donation(p_organization_id) then
  raise exception 'Acesso nao autorizado.' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'amount_cents',d.amount_cents,'frequency',d.frequency,
   'payment_method',d.payment_method,'status',d.status,'created_at',d.created_at,
   'checkout_url',d.checkout_url,'can_cancel',d.frequency='monthly'
       and d.provider_subscription_id is not null and d.status<>'canceled'
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
notify pgrst,'reload schema';
