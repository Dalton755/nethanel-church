-- Nethanel Elo v43
-- Fluxo de solicitação de exclusão de conta para conformidade de publicação.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  source text not null check (source in ('app','web')),
  reason text,
  status text not null default 'requested'
    check (status in ('requested','verified','in_progress','completed','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests(status, requested_at desc);

create unique index if not exists account_deletion_requests_active_email_uidx
  on public.account_deletion_requests(lower(email))
  where status in ('requested','verified','in_progress');

alter table public.account_deletion_requests enable row level security;
revoke all on table public.account_deletion_requests from anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_requests to service_role;

create or replace function public.request_my_account_deletion(
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_request public.account_deletion_requests;
begin
  if v_user_id is null then
    raise exception 'Você precisa estar autenticado.'
      using errcode = '42501';
  end if;

  select lower(trim(u.email))
  into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null or v_email = '' then
    raise exception 'Sua conta não possui um e-mail válido.';
  end if;

  select *
  into v_request
  from public.account_deletion_requests r
  where lower(r.email) = v_email
    and r.status in ('requested','verified','in_progress')
  order by r.requested_at desc
  limit 1;

  if v_request.id is null then
    insert into public.account_deletion_requests(
      auth_user_id,
      email,
      source,
      reason
    )
    values (
      v_user_id,
      v_email,
      'app',
      nullif(left(trim(coalesce(p_reason,'')), 1000), '')
    )
    returning * into v_request;
  end if;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'requested_at', v_request.requested_at
  );
end;
$$;

revoke all on function public.request_my_account_deletion(text) from public, anon;
grant execute on function public.request_my_account_deletion(text) to authenticated;

create or replace function public.request_account_deletion_by_email(
  p_email text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_user_id uuid;
  v_existing_id uuid;
begin
  if length(v_email) < 5
     or length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  select r.id
  into v_existing_id
  from public.account_deletion_requests r
  where lower(r.email) = v_email
    and r.status in ('requested','verified','in_progress')
  order by r.requested_at desc
  limit 1;

  if v_existing_id is null then
    select u.id
    into v_user_id
    from auth.users u
    where lower(u.email) = v_email
    limit 1;

    insert into public.account_deletion_requests(
      auth_user_id,
      email,
      source,
      reason
    )
    values (
      v_user_id,
      v_email,
      'web',
      nullif(left(trim(coalesce(p_reason,'')), 1000), '')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'Se houver uma conta vinculada a este e-mail, o pedido será processado.'
  );
end;
$$;

revoke all on function public.request_account_deletion_by_email(text,text) from public;
grant execute on function public.request_account_deletion_by_email(text,text) to anon, authenticated;
