-- ELO v36b — ajustes de acesso e configuração financeira.

drop policy if exists communion_occurrences_select_authenticated
on public.communion_occurrences;

create policy communion_occurrences_select_authenticated
on public.communion_occurrences
for select
to authenticated
using (app_private.is_org_member(organization_id));

create or replace function public.list_finance_accounts(
  p_organization_id uuid
)
returns table(
  account_id uuid,
  account_name text,
  account_type text,
  initial_balance numeric,
  current_balance numeric,
  active boolean
)
language plpgsql
volatile
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
begin
  if not app_private.has_permission(
    p_organization_id,'finance.view',null
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  perform app_private.ensure_finance_defaults(p_organization_id);

  return query
  select
    a.id,a.name,a.account_type,a.initial_balance,
    (
      a.initial_balance+
      coalesce((
        select sum(
          case t.kind when 'income' then t.amount else -t.amount end
        )
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
volatile
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
begin
  if not app_private.has_permission(
    p_organization_id,'finance.view',null
  ) then
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

create or replace function public.get_finance_dashboard(
  p_organization_id uuid
)
returns jsonb
language plpgsql
volatile
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
  if not app_private.has_permission(
    p_organization_id,'finance.view',null
  ) then
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
    coalesce(sum(
      case when t.kind='income' then t.amount else -t.amount end
    ),0)+
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

create or replace function public.save_finance_account(
  p_organization_id uuid,
  p_account_id uuid,
  p_name text,
  p_account_type text,
  p_initial_balance numeric default 0
)
returns public.finance_accounts
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result public.finance_accounts%rowtype;
  v_name text:=trim(coalesce(p_name,''));
  v_type text:=lower(trim(coalesce(p_account_type,'')));
begin
  if not app_private.has_permission(
    p_organization_id,'finance.manage',null
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if length(v_name)<2 then
    raise exception 'Account name required';
  end if;

  if v_type not in ('cash','bank','wallet') then
    raise exception 'Invalid account type';
  end if;

  if p_account_id is null then
    insert into public.finance_accounts(
      organization_id,name,account_type,initial_balance,
      active,created_by
    )
    values(
      p_organization_id,v_name,v_type,
      coalesce(p_initial_balance,0),true,auth.uid()
    )
    returning * into v_result;
  else
    update public.finance_accounts
    set name=v_name,
        account_type=v_type,
        initial_balance=coalesce(p_initial_balance,0),
        active=true,
        updated_at=now()
    where id=p_account_id
      and organization_id=p_organization_id
      and system_key is null
    returning * into v_result;

    if not found then
      raise exception 'Account not found or system account cannot be edited';
    end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.save_finance_account(
  uuid,uuid,text,text,numeric
) from public,anon;
grant execute on function public.save_finance_account(
  uuid,uuid,text,text,numeric
) to authenticated;

create or replace function public.save_finance_category(
  p_organization_id uuid,
  p_category_id uuid,
  p_kind text,
  p_name text
)
returns public.finance_categories
language plpgsql
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
declare
  v_result public.finance_categories%rowtype;
  v_name text:=trim(coalesce(p_name,''));
  v_kind text:=lower(trim(coalesce(p_kind,'')));
begin
  if not app_private.has_permission(
    p_organization_id,'finance.manage',null
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if length(v_name)<2 then
    raise exception 'Category name required';
  end if;

  if v_kind not in ('income','expense') then
    raise exception 'Invalid category kind';
  end if;

  if p_category_id is null then
    insert into public.finance_categories(
      organization_id,kind,name,active,created_by
    )
    values(p_organization_id,v_kind,v_name,true,auth.uid())
    returning * into v_result;
  else
    update public.finance_categories
    set kind=v_kind,
        name=v_name,
        active=true,
        updated_at=now()
    where id=p_category_id
      and organization_id=p_organization_id
      and system_key is null
    returning * into v_result;

    if not found then
      raise exception 'Category not found or system category cannot be edited';
    end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.save_finance_category(
  uuid,uuid,text,text
) from public,anon;
grant execute on function public.save_finance_category(
  uuid,uuid,text,text
) to authenticated;

create or replace function public.get_finance_service_closure(
  p_organization_id uuid,
  p_event_id uuid
)
returns table(
  closure_id uuid,
  status text,
  cash_amount numeric,
  pix_amount numeric,
  card_amount numeric,
  other_amount numeric,
  total_amount numeric,
  notes text,
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select
    fc.id,fc.status,fc.cash_amount,fc.pix_amount,fc.card_amount,
    fc.other_amount,fc.total_amount,fc.notes,
    fc.submitted_by,fc.submitted_at,fc.approved_by,fc.approved_at
  from public.finance_service_closures fc
  where fc.organization_id=p_organization_id
    and fc.event_id=p_event_id
    and app_private.has_permission(p_organization_id,'finance.view',null)
  limit 1;
$function$;

revoke all on function public.get_finance_service_closure(uuid,uuid)
from public,anon;
grant execute on function public.get_finance_service_closure(uuid,uuid)
to authenticated;

notify pgrst,'reload schema';
