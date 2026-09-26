-- ELO v36 — financeiro real.
-- Mantém o financeiro separado do membro e protegido por finance.view/manage.

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('cash','bank','wallet')),
  system_key text,
  initial_balance numeric(14,2) not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index if not exists finance_accounts_system_key_unique
on public.finance_accounts(organization_id,system_key)
where system_key is not null;

create index if not exists finance_accounts_org_idx
on public.finance_accounts(organization_id,active,name);

alter table public.finance_accounts enable row level security;

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  name text not null,
  system_key text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index if not exists finance_categories_name_unique
on public.finance_categories(organization_id,kind,lower(name))
where active=true;

create unique index if not exists finance_categories_system_key_unique
on public.finance_categories(organization_id,system_key)
where system_key is not null;

create index if not exists finance_categories_org_idx
on public.finance_categories(organization_id,kind,active,name);

alter table public.finance_categories enable row level security;

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid,
  account_id uuid not null,
  category_id uuid not null,
  department_id uuid,
  event_id uuid,
  person_id uuid,
  kind text not null check (kind in ('income','expense')),
  amount numeric(14,2) not null check (amount>0),
  description text not null,
  occurred_on date not null default current_date,
  due_on date,
  paid_on date,
  status text not null default 'paid' check (status in ('pending','paid','cancelled')),
  payment_method text check (
    payment_method is null
    or payment_method in ('cash','pix','card','transfer','boleto','other','mixed')
  ),
  reference text,
  notes text,
  source text not null default 'manual'
    check (source in ('manual','service_closure','pix_reconciliation','import')),
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (unit_id, organization_id)
    references public.units(id, organization_id) on delete set null,
  foreign key (account_id, organization_id)
    references public.finance_accounts(id, organization_id),
  foreign key (category_id, organization_id)
    references public.finance_categories(id, organization_id),
  foreign key (department_id, organization_id)
    references public.departments(id, organization_id) on delete set null,
  foreign key (event_id, organization_id)
    references public.events(id, organization_id) on delete set null,
  foreign key (person_id, organization_id)
    references public.people(id, organization_id) on delete set null
);

create index if not exists finance_transactions_org_date_idx
on public.finance_transactions(organization_id,occurred_on desc,status);

create index if not exists finance_transactions_due_idx
on public.finance_transactions(organization_id,status,due_on)
where status='pending';

create index if not exists finance_transactions_event_idx
on public.finance_transactions(organization_id,event_id)
where event_id is not null;

alter table public.finance_transactions enable row level security;

create table if not exists public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month_start date not null,
  category_id uuid not null,
  planned_amount numeric(14,2) not null check (planned_amount>=0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,month_start,category_id),
  foreign key (category_id, organization_id)
    references public.finance_categories(id, organization_id) on delete cascade,
  check (month_start=date_trunc('month',month_start)::date)
);

create index if not exists finance_budgets_month_idx
on public.finance_budgets(organization_id,month_start);

alter table public.finance_budgets enable row level security;

create table if not exists public.finance_service_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null,
  event_id uuid not null,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','cancelled')),
  cash_amount numeric(14,2) not null default 0 check (cash_amount>=0),
  pix_amount numeric(14,2) not null default 0 check (pix_amount>=0),
  card_amount numeric(14,2) not null default 0 check (card_amount>=0),
  other_amount numeric(14,2) not null default 0 check (other_amount>=0),
  total_amount numeric(14,2) generated always as (
    cash_amount+pix_amount+card_amount+other_amount
  ) stored,
  notes text,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  transaction_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,event_id),
  foreign key (unit_id,organization_id)
    references public.units(id,organization_id) on delete cascade,
  foreign key (event_id,organization_id)
    references public.events(id,organization_id) on delete cascade,
  foreign key (transaction_id,organization_id)
    references public.finance_transactions(id,organization_id) on delete set null
);

create index if not exists finance_service_closures_status_idx
on public.finance_service_closures(organization_id,status,created_at desc);

alter table public.finance_service_closures enable row level security;

create table if not exists public.finance_pix_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid,
  amount numeric(14,2) not null check (amount>0),
  provider_reference text not null,
  status text not null default 'pending'
    check (status in ('pending','identified','reconciled','cancelled')),
  payer_label text,
  paid_at timestamptz,
  transaction_id uuid,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,provider_reference),
  foreign key (event_id,organization_id)
    references public.events(id,organization_id) on delete set null,
  foreign key (transaction_id,organization_id)
    references public.finance_transactions(id,organization_id) on delete set null
);

create index if not exists finance_pix_references_status_idx
on public.finance_pix_references(organization_id,status,created_at desc);

alter table public.finance_pix_references enable row level security;

drop trigger if exists finance_accounts_touch on public.finance_accounts;
create trigger finance_accounts_touch before update on public.finance_accounts
for each row execute function app_private.elo_touch_updated_at();

drop trigger if exists finance_categories_touch on public.finance_categories;
create trigger finance_categories_touch before update on public.finance_categories
for each row execute function app_private.elo_touch_updated_at();

drop trigger if exists finance_transactions_touch on public.finance_transactions;
create trigger finance_transactions_touch before update on public.finance_transactions
for each row execute function app_private.elo_touch_updated_at();

drop trigger if exists finance_budgets_touch on public.finance_budgets;
create trigger finance_budgets_touch before update on public.finance_budgets
for each row execute function app_private.elo_touch_updated_at();

drop trigger if exists finance_service_closures_touch on public.finance_service_closures;
create trigger finance_service_closures_touch before update on public.finance_service_closures
for each row execute function app_private.elo_touch_updated_at();

drop trigger if exists finance_pix_references_touch on public.finance_pix_references;
create trigger finance_pix_references_touch before update on public.finance_pix_references
for each row execute function app_private.elo_touch_updated_at();

create or replace function app_private.ensure_finance_defaults(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $function$
begin
  insert into public.finance_accounts(
    organization_id,name,account_type,system_key,initial_balance,active
  )
  values(p_organization_id,'Caixa geral','cash','cash-general',0,true)
  on conflict (organization_id,system_key) where system_key is not null
  do update set active=true;

  insert into public.finance_categories(
    organization_id,kind,name,system_key,active
  )
  values
    (p_organization_id,'income','Dízimos','tithes',true),
    (p_organization_id,'income','Ofertas','offerings',true),
    (p_organization_id,'income','Missões','missions',true),
    (p_organization_id,'income','Campanhas','campaigns',true),
    (p_organization_id,'income','Cantina','canteen',true),
    (p_organization_id,'income','Eventos','events-income',true),
    (p_organization_id,'expense','Água','water',true),
    (p_organization_id,'expense','Energia','energy',true),
    (p_organization_id,'expense','Internet','internet',true),
    (p_organization_id,'expense','Aluguel','rent',true),
    (p_organization_id,'expense','Salários','payroll',true),
    (p_organization_id,'expense','Limpeza','cleaning',true),
    (p_organization_id,'expense','Manutenção','maintenance',true)
  on conflict (organization_id,system_key) where system_key is not null
  do update set active=true;
end;
$function$;

create or replace function public.list_finance_accounts(p_organization_id uuid)
returns table(
  account_id uuid,
  account_name text,
  account_type text,
  initial_balance numeric,
  current_balance numeric,
  active boolean
)
language plpgsql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
begin
  if not app_private.has_permission(p_organization_id,'finance.view',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  perform app_private.ensure_finance_defaults(p_organization_id);

  return query
  select
    a.id,a.name,a.account_type,a.initial_balance,
    (
      a.initial_balance+
      coalesce((
        select sum(case t.kind when 'income' then t.amount else -t.amount end)
        from public.finance_transactions t
        where t.organization_id=a.organization_id
          and t.account_id=a.id
          and t.status='paid'
      ),0)
    )::numeric,
    a.active
  from public.finance_accounts a
  where a.organization_id=p_organization_id
    and a.active=true
  order by a.name;
end;
$function$;

revoke all on function public.list_finance_accounts(uuid) from public,anon;
grant execute on function public.list_finance_accounts(uuid) to authenticated;

create or replace function public.list_finance_categories(
  p_organization_id uuid,
  p_kind text default null
)
returns table(
  category_id uuid,
  kind text,
  category_name text,
  system_key text,
  active boolean
)
language plpgsql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
begin
  if not app_private.has_permission(p_organization_id,'finance.view',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  perform app_private.ensure_finance_defaults(p_organization_id);

  return query
  select c.id,c.kind,c.name,c.system_key,c.active
  from public.finance_categories c
  where c.organization_id=p_organization_id
    and c.active=true
    and (p_kind is null or c.kind=lower(trim(p_kind)))
  order by c.kind,c.name;
end;
$function$;

revoke all on function public.list_finance_categories(uuid,text) from public,anon;
grant execute on function public.list_finance_categories(uuid,text) to authenticated;

create or replace function public.get_finance_dashboard(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_month_start date:=date_trunc('month',current_date)::date;
  v_month_end date:=(date_trunc('month',current_date)+interval '1 month')::date;
  v_income numeric:=0;
  v_expense numeric:=0;
  v_balance numeric:=0;
  v_payable numeric:=0;
  v_receivable numeric:=0;
  v_payable_count integer:=0;
  v_receivable_count integer:=0;
  v_pending_closures integer:=0;
begin
  if not app_private.has_permission(p_organization_id,'finance.view',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  perform app_private.ensure_finance_defaults(p_organization_id);

  select
    coalesce(sum(case when kind='income' then amount else 0 end),0),
    coalesce(sum(case when kind='expense' then amount else 0 end),0)
  into v_income,v_expense
  from public.finance_transactions
  where organization_id=p_organization_id
    and status='paid'
    and occurred_on>=v_month_start
    and occurred_on<v_month_end;

  select
    coalesce(sum(case when t.kind='income' then t.amount else -t.amount end),0)+
    coalesce((
      select sum(a.initial_balance)
      from public.finance_accounts a
      where a.organization_id=p_organization_id
        and a.active=true
    ),0)
  into v_balance
  from public.finance_transactions t
  where t.organization_id=p_organization_id
    and t.status='paid';

  select coalesce(sum(amount),0),count(*)::integer
  into v_payable,v_payable_count
  from public.finance_transactions
  where organization_id=p_organization_id
    and kind='expense' and status='pending';

  select coalesce(sum(amount),0),count(*)::integer
  into v_receivable,v_receivable_count
  from public.finance_transactions
  where organization_id=p_organization_id
    and kind='income' and status='pending';

  select count(*)::integer into v_pending_closures
  from public.finance_service_closures
  where organization_id=p_organization_id
    and status='submitted';

  return jsonb_build_object(
    'month_start',v_month_start,
    'month_income',v_income,
    'month_expense',v_expense,
    'month_result',v_income-v_expense,
    'balance',v_balance,
    'payables',v_payable,
    'payables_count',v_payable_count,
    'receivables',v_receivable,
    'receivables_count',v_receivable_count,
    'pending_closures',v_pending_closures
  );
end;
$function$;

revoke all on function public.get_finance_dashboard(uuid) from public,anon;
grant execute on function public.get_finance_dashboard(uuid) to authenticated;

create or replace function public.list_finance_transactions(
  p_organization_id uuid,
  p_from date default null,
  p_to date default null,
  p_status text default null,
  p_limit integer default 100
)
returns table(
  transaction_id uuid,
  kind text,
  amount numeric,
  description text,
  occurred_on date,
  due_on date,
  paid_on date,
  status text,
  payment_method text,
  reference text,
  category_id uuid,
  category_name text,
  account_id uuid,
  account_name text,
  unit_id uuid,
  event_id uuid,
  department_id uuid,
  source text
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    t.id,t.kind,t.amount,t.description,t.occurred_on,t.due_on,t.paid_on,
    t.status,t.payment_method,t.reference,
    c.id,c.name,a.id,a.name,
    t.unit_id,t.event_id,t.department_id,t.source
  from public.finance_transactions t
  join public.finance_categories c
    on c.id=t.category_id and c.organization_id=t.organization_id
  join public.finance_accounts a
    on a.id=t.account_id and a.organization_id=t.organization_id
  where t.organization_id=p_organization_id
    and app_private.has_permission(p_organization_id,'finance.view',null)
    and (p_from is null or coalesce(t.due_on,t.occurred_on)>=p_from)
    and (p_to is null or coalesce(t.due_on,t.occurred_on)<=p_to)
    and (p_status is null or t.status=p_status)
  order by
    case when t.status='pending' then 0 else 1 end,
    coalesce(t.due_on,t.occurred_on) asc,
    t.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$function$;

revoke all on function public.list_finance_transactions(
  uuid,date,date,text,integer
) from public,anon;
grant execute on function public.list_finance_transactions(
  uuid,date,date,text,integer
) to authenticated;

create or replace function public.save_finance_transaction(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_unit_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_kind text,
  p_amount numeric,
  p_description text,
  p_occurred_on date,
  p_due_on date,
  p_status text,
  p_payment_method text,
  p_reference text,
  p_notes text,
  p_department_id uuid default null,
  p_event_id uuid default null,
  p_person_id uuid default null
)
returns public.finance_transactions
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result public.finance_transactions%rowtype;
  v_kind text:=lower(trim(coalesce(p_kind,'')));
  v_status text:=lower(trim(coalesce(p_status,'paid')));
  v_description text:=trim(coalesce(p_description,''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.has_permission(p_organization_id,'finance.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  perform app_private.ensure_finance_defaults(p_organization_id);

  if v_kind not in ('income','expense') then
    raise exception 'Invalid transaction kind';
  end if;

  if v_status not in ('pending','paid') then
    raise exception 'Invalid transaction status';
  end if;

  if coalesce(p_amount,0)<=0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if length(v_description)<2 then
    raise exception 'Description required';
  end if;

  if not exists (
    select 1 from public.finance_accounts a
    where a.id=p_account_id
      and a.organization_id=p_organization_id
      and a.active=true
  ) then
    raise exception 'Account not found';
  end if;

  if not exists (
    select 1 from public.finance_categories c
    where c.id=p_category_id
      and c.organization_id=p_organization_id
      and c.kind=v_kind
      and c.active=true
  ) then
    raise exception 'Category does not match transaction kind';
  end if;

  if p_transaction_id is null then
    insert into public.finance_transactions(
      organization_id,unit_id,account_id,category_id,
      department_id,event_id,person_id,kind,amount,description,
      occurred_on,due_on,paid_on,status,payment_method,
      reference,notes,source,created_by,updated_by
    )
    values(
      p_organization_id,p_unit_id,p_account_id,p_category_id,
      p_department_id,p_event_id,p_person_id,v_kind,p_amount,
      v_description,coalesce(p_occurred_on,current_date),p_due_on,
      case when v_status='paid' then coalesce(p_occurred_on,current_date) else null end,
      v_status,nullif(lower(trim(coalesce(p_payment_method,''))), ''),
      nullif(trim(coalesce(p_reference,'')),''),
      nullif(trim(coalesce(p_notes,'')),''),
      'manual',auth.uid(),auth.uid()
    )
    returning * into v_result;
  else
    update public.finance_transactions
    set unit_id=p_unit_id,
        account_id=p_account_id,
        category_id=p_category_id,
        department_id=p_department_id,
        event_id=p_event_id,
        person_id=p_person_id,
        kind=v_kind,
        amount=p_amount,
        description=v_description,
        occurred_on=coalesce(p_occurred_on,current_date),
        due_on=p_due_on,
        paid_on=case
          when v_status='paid' then coalesce(paid_on,p_occurred_on,current_date)
          else null
        end,
        status=v_status,
        payment_method=nullif(lower(trim(coalesce(p_payment_method,''))), ''),
        reference=nullif(trim(coalesce(p_reference,'')),''),
        notes=nullif(trim(coalesce(p_notes,'')),''),
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_transaction_id
      and organization_id=p_organization_id
      and source='manual'
    returning * into v_result;

    if not found then
      raise exception 'Transaction not found or cannot be edited';
    end if;
  end if;

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    'finance.transaction_saved','finance_transactions',v_result.id,
    jsonb_build_object(
      'kind',v_result.kind,'amount',v_result.amount,
      'status',v_result.status,'category_id',v_result.category_id
    )
  );

  return v_result;
end;
$function$;

revoke all on function public.save_finance_transaction(
  uuid,uuid,uuid,uuid,uuid,text,numeric,text,date,date,text,text,text,text,uuid,uuid,uuid
) from public,anon;
grant execute on function public.save_finance_transaction(
  uuid,uuid,uuid,uuid,uuid,text,numeric,text,date,date,text,text,text,text,uuid,uuid,uuid
) to authenticated;

create or replace function public.mark_finance_transaction_paid(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_paid_on date default current_date,
  p_payment_method text default null
)
returns public.finance_transactions
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result public.finance_transactions%rowtype;
begin
  if not app_private.has_permission(p_organization_id,'finance.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  update public.finance_transactions
  set status='paid',
      paid_on=coalesce(p_paid_on,current_date),
      payment_method=coalesce(
        nullif(lower(trim(coalesce(p_payment_method,''))),''),
        payment_method
      ),
      updated_by=auth.uid(),
      updated_at=now()
  where id=p_transaction_id
    and organization_id=p_organization_id
    and status='pending'
  returning * into v_result;

  if not found then
    raise exception 'Pending transaction not found';
  end if;

  perform app_private.write_audit(
    p_organization_id,v_result.unit_id,
    'finance.transaction_paid','finance_transactions',v_result.id,
    jsonb_build_object('paid_on',v_result.paid_on)
  );

  return v_result;
end;
$function$;

revoke all on function public.mark_finance_transaction_paid(
  uuid,uuid,date,text
) from public,anon;
grant execute on function public.mark_finance_transaction_paid(
  uuid,uuid,date,text
) to authenticated;

create or replace function public.save_finance_budget(
  p_organization_id uuid,
  p_category_id uuid,
  p_month_start date,
  p_planned_amount numeric,
  p_notes text default null
)
returns public.finance_budgets
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result public.finance_budgets%rowtype;
  v_month date:=date_trunc('month',coalesce(p_month_start,current_date))::date;
begin
  if not app_private.has_permission(p_organization_id,'finance.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if coalesce(p_planned_amount,0)<0 then
    raise exception 'Invalid budget amount';
  end if;

  if not exists (
    select 1 from public.finance_categories c
    where c.id=p_category_id
      and c.organization_id=p_organization_id
      and c.kind='expense'
      and c.active=true
  ) then
    raise exception 'Expense category not found';
  end if;

  insert into public.finance_budgets(
    organization_id,month_start,category_id,planned_amount,notes,created_by
  )
  values(
    p_organization_id,v_month,p_category_id,p_planned_amount,
    nullif(trim(coalesce(p_notes,'')),''),auth.uid()
  )
  on conflict(organization_id,month_start,category_id)
  do update set
    planned_amount=excluded.planned_amount,
    notes=excluded.notes,
    updated_at=now()
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.save_finance_budget(
  uuid,uuid,date,numeric,text
) from public,anon;
grant execute on function public.save_finance_budget(
  uuid,uuid,date,numeric,text
) to authenticated;

create or replace function public.list_finance_budget_status(
  p_organization_id uuid,
  p_month_start date default current_date
)
returns table(
  category_id uuid,
  category_name text,
  planned_amount numeric,
  actual_amount numeric,
  remaining_amount numeric
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  with month_window as (
    select
      date_trunc('month',coalesce(p_month_start,current_date))::date as start_date,
      (date_trunc('month',coalesce(p_month_start,current_date))+interval '1 month')::date as end_date
  )
  select
    c.id,c.name,
    coalesce(b.planned_amount,0)::numeric,
    coalesce(sum(t.amount) filter (
      where t.status='paid'
        and t.kind='expense'
        and t.occurred_on>=mw.start_date
        and t.occurred_on<mw.end_date
    ),0)::numeric,
    (
      coalesce(b.planned_amount,0)-
      coalesce(sum(t.amount) filter (
        where t.status='paid'
          and t.kind='expense'
          and t.occurred_on>=mw.start_date
          and t.occurred_on<mw.end_date
      ),0)
    )::numeric
  from public.finance_categories c
  cross join month_window mw
  left join public.finance_budgets b
    on b.organization_id=c.organization_id
   and b.category_id=c.id
   and b.month_start=mw.start_date
  left join public.finance_transactions t
    on t.organization_id=c.organization_id
   and t.category_id=c.id
  where c.organization_id=p_organization_id
    and c.kind='expense'
    and c.active=true
    and app_private.has_permission(p_organization_id,'finance.view',null)
  group by c.id,c.name,b.planned_amount,mw.start_date,mw.end_date
  order by c.name;
$function$;

revoke all on function public.list_finance_budget_status(uuid,date)
from public,anon;
grant execute on function public.list_finance_budget_status(uuid,date)
to authenticated;

create or replace function public.list_finance_service_candidates(
  p_organization_id uuid,
  p_unit_id uuid
)
returns table(
  event_id uuid,
  event_title text,
  starts_at timestamptz,
  closure_id uuid,
  closure_status text,
  total_amount numeric
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    e.id,e.title,e.starts_at,
    fc.id,fc.status,fc.total_amount
  from public.events e
  join public.event_types et
    on et.id=e.event_type_id
   and et.organization_id=e.organization_id
  left join public.finance_service_closures fc
    on fc.organization_id=e.organization_id
   and fc.event_id=e.id
  where e.organization_id=p_organization_id
    and e.unit_id=p_unit_id
    and et.type_key='service'
    and e.status<>'cancelled'
    and e.starts_at>=now()-interval '90 days'
    and e.starts_at<=now()+interval '7 days'
    and app_private.has_permission(p_organization_id,'finance.view',null)
  order by e.starts_at desc
  limit 40;
$function$;

revoke all on function public.list_finance_service_candidates(uuid,uuid)
from public,anon;
grant execute on function public.list_finance_service_candidates(uuid,uuid)
to authenticated;

create or replace function public.save_finance_service_closure(
  p_organization_id uuid,
  p_unit_id uuid,
  p_event_id uuid,
  p_cash_amount numeric,
  p_pix_amount numeric,
  p_card_amount numeric,
  p_other_amount numeric,
  p_notes text,
  p_submit boolean default false
)
returns public.finance_service_closures
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result public.finance_service_closures%rowtype;
begin
  if not app_private.has_permission(p_organization_id,'finance.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.events e
    where e.id=p_event_id
      and e.organization_id=p_organization_id
      and e.unit_id=p_unit_id
      and e.status<>'cancelled'
  ) then
    raise exception 'Service not found';
  end if;

  if least(
    coalesce(p_cash_amount,0),coalesce(p_pix_amount,0),
    coalesce(p_card_amount,0),coalesce(p_other_amount,0)
  )<0 then
    raise exception 'Invalid closure values';
  end if;

  insert into public.finance_service_closures(
    organization_id,unit_id,event_id,status,
    cash_amount,pix_amount,card_amount,other_amount,
    notes,submitted_by,submitted_at,created_by
  )
  values(
    p_organization_id,p_unit_id,p_event_id,
    case when p_submit then 'submitted' else 'draft' end,
    coalesce(p_cash_amount,0),coalesce(p_pix_amount,0),
    coalesce(p_card_amount,0),coalesce(p_other_amount,0),
    nullif(trim(coalesce(p_notes,'')),''),
    case when p_submit then auth.uid() else null end,
    case when p_submit then now() else null end,
    auth.uid()
  )
  on conflict(organization_id,event_id)
  do update set
    cash_amount=excluded.cash_amount,
    pix_amount=excluded.pix_amount,
    card_amount=excluded.card_amount,
    other_amount=excluded.other_amount,
    notes=excluded.notes,
    status=case
      when public.finance_service_closures.status='approved'
        then public.finance_service_closures.status
      else excluded.status
    end,
    submitted_by=case
      when excluded.status='submitted' then auth.uid()
      else public.finance_service_closures.submitted_by
    end,
    submitted_at=case
      when excluded.status='submitted' then now()
      else public.finance_service_closures.submitted_at
    end,
    updated_at=now()
  returning * into v_result;

  if v_result.status='approved' and p_submit then
    raise exception 'Approved closure cannot be changed';
  end if;

  perform app_private.write_audit(
    p_organization_id,p_unit_id,
    case when p_submit
      then 'finance.service_closure_submitted'
      else 'finance.service_closure_saved'
    end,
    'finance_service_closures',v_result.id,
    jsonb_build_object(
      'event_id',p_event_id,
      'total_amount',v_result.total_amount,
      'status',v_result.status
    )
  );

  return v_result;
end;
$function$;

revoke all on function public.save_finance_service_closure(
  uuid,uuid,uuid,numeric,numeric,numeric,numeric,text,boolean
) from public,anon;
grant execute on function public.save_finance_service_closure(
  uuid,uuid,uuid,numeric,numeric,numeric,numeric,text,boolean
) to authenticated;

create or replace function public.approve_finance_service_closure(
  p_organization_id uuid,
  p_closure_id uuid
)
returns public.finance_service_closures
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_closure public.finance_service_closures%rowtype;
  v_account_id uuid;
  v_category_id uuid;
  v_transaction_id uuid;
  v_title text;
begin
  if not app_private.has_permission(p_organization_id,'finance.manage',null) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  perform app_private.ensure_finance_defaults(p_organization_id);

  select * into v_closure
  from public.finance_service_closures
  where id=p_closure_id
    and organization_id=p_organization_id
  for update;

  if not found then raise exception 'Closure not found'; end if;
  if v_closure.status<>'submitted' then
    raise exception 'Closure must be submitted first';
  end if;
  if v_closure.submitted_by=auth.uid() then
    raise exception 'A second conference is required';
  end if;

  select id into v_account_id
  from public.finance_accounts
  where organization_id=p_organization_id
    and system_key='cash-general'
    and active=true
  limit 1;

  select id into v_category_id
  from public.finance_categories
  where organization_id=p_organization_id
    and system_key='offerings'
    and active=true
  limit 1;

  select title into v_title
  from public.events
  where id=v_closure.event_id
    and organization_id=p_organization_id;

  insert into public.finance_transactions(
    organization_id,unit_id,account_id,category_id,event_id,
    kind,amount,description,occurred_on,paid_on,status,
    payment_method,source,source_id,created_by,updated_by
  )
  values(
    p_organization_id,v_closure.unit_id,v_account_id,v_category_id,
    v_closure.event_id,'income',v_closure.total_amount,
    'Fechamento de culto — '||coalesce(v_title,'Culto'),
    coalesce((
      select (e.starts_at at time zone u.timezone)::date
      from public.events e
      join public.units u
        on u.id=e.unit_id
       and u.organization_id=e.organization_id
      where e.id=v_closure.event_id
        and e.organization_id=p_organization_id
    ),current_date),
    current_date,'paid','mixed','service_closure',
    v_closure.id,auth.uid(),auth.uid()
  )
  returning id into v_transaction_id;

  update public.finance_service_closures
  set status='approved',
      approved_by=auth.uid(),
      approved_at=now(),
      transaction_id=v_transaction_id,
      updated_at=now()
  where id=v_closure.id
  returning * into v_closure;

  perform app_private.write_audit(
    p_organization_id,v_closure.unit_id,
    'finance.service_closure_approved',
    'finance_service_closures',v_closure.id,
    jsonb_build_object(
      'event_id',v_closure.event_id,
      'total_amount',v_closure.total_amount,
      'transaction_id',v_transaction_id
    )
  );

  return v_closure;
end;
$function$;

revoke all on function public.approve_finance_service_closure(uuid,uuid)
from public,anon;
grant execute on function public.approve_finance_service_closure(uuid,uuid)
to authenticated;

notify pgrst,'reload schema';
