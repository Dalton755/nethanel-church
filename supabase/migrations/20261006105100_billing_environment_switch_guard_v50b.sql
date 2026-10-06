create or replace function public.billing_invalidate_mismatched_subscription()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_expected text;
begin
  v_expected := public.billing_environment_for_organization(v_org);

  update public.organization_subscriptions os
     set status='expired',
         updated_at=now()
   where os.organization_id=v_org
     and os.provider='nethanel_billing'
     and os.billing_environment <> v_expected
     and lower(coalesce(os.status,'')) in ('active','pending','trialing','trial');

  return coalesce(new,old);
end;
$$;

revoke all on function public.billing_invalidate_mismatched_subscription() from public;

drop trigger if exists billing_environment_switch_guard on public.billing_organization_environments;
create trigger billing_environment_switch_guard
after insert or update or delete on public.billing_organization_environments
for each row execute function public.billing_invalidate_mismatched_subscription();