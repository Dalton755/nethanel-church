create or replace function public.billing_reconcile_paid_access_after_recurring_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_paid public.billing_invoices%rowtype;
begin
  if lower(coalesce(new.status,'')) in ('cancelled','canceled','refused','expired') then
    select * into v_paid
    from public.billing_invoices bi
    where bi.organization_id = new.organization_id
      and bi.billing_environment = new.billing_environment
      and bi.status = 'paid'
      and bi.access_ends_at is not null
      and bi.access_ends_at > now()
    order by bi.access_ends_at desc, bi.paid_at desc nulls last, bi.created_at desc
    limit 1;

    if found then
      update public.organization_subscriptions os
      set plan_code = v_paid.plan_code,
          status = 'active',
          provider = 'nethanel_billing',
          provider_subscription_id = case
            when v_paid.plan_code = new.plan_code then null
            else os.provider_subscription_id
          end,
          billing_environment = v_paid.billing_environment,
          current_period_end = greatest(coalesce(os.current_period_end, v_paid.access_ends_at), v_paid.access_ends_at),
          updated_at = now()
      where os.organization_id = new.organization_id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.billing_reconcile_paid_access_after_recurring_change() from public, anon, authenticated;
grant execute on function public.billing_reconcile_paid_access_after_recurring_change() to postgres, service_role;

drop trigger if exists billing_recurring_reconcile_paid_access on public.billing_recurring_authorizations;
create trigger billing_recurring_reconcile_paid_access
after update of status on public.billing_recurring_authorizations
for each row
when (old.status is distinct from new.status)
execute function public.billing_reconcile_paid_access_after_recurring_change();