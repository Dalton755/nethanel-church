create or replace function public.billing_clear_stale_subscription_on_plan_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.plan_code is distinct from new.plan_code
     and old.provider_subscription_id is not null
     and new.provider_subscription_id = old.provider_subscription_id then
    new.provider_subscription_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.billing_clear_stale_subscription_on_plan_change() from public, anon, authenticated;
grant execute on function public.billing_clear_stale_subscription_on_plan_change() to service_role;

drop trigger if exists trg_billing_clear_stale_subscription_on_plan_change on public.organization_subscriptions;
create trigger trg_billing_clear_stale_subscription_on_plan_change
before update on public.organization_subscriptions
for each row execute function public.billing_clear_stale_subscription_on_plan_change();
