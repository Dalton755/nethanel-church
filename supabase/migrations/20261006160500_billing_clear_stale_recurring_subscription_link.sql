create or replace function public.billing_clear_stale_subscription_link()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.provider_subscription_id is not null
     and not exists (
       select 1
       from public.billing_recurring_authorizations bra
       where bra.organization_id = new.organization_id
         and bra.plan_code = new.plan_code
         and lower(bra.status) in ('created','pending','active')
         and bra.provider_subscription_id = new.provider_subscription_id
         and bra.billing_environment = coalesce(new.billing_environment,'production')
     ) then
    new.provider_subscription_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.billing_clear_stale_subscription_link() from public, anon, authenticated;
grant execute on function public.billing_clear_stale_subscription_link() to service_role, postgres;

drop trigger if exists trg_billing_clear_stale_subscription_link on public.organization_subscriptions;
create trigger trg_billing_clear_stale_subscription_link
before insert or update of plan_code, provider_subscription_id, billing_environment
on public.organization_subscriptions
for each row execute function public.billing_clear_stale_subscription_link();

update public.organization_subscriptions os
set provider_subscription_id = null,
    updated_at = now()
where os.provider_subscription_id is not null
  and not exists (
    select 1
    from public.billing_recurring_authorizations bra
    where bra.organization_id = os.organization_id
      and bra.plan_code = os.plan_code
      and lower(bra.status) in ('created','pending','active')
      and bra.provider_subscription_id = os.provider_subscription_id
      and bra.billing_environment = coalesce(os.billing_environment,'production')
  );