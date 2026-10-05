-- Nethanel Elo v46d
-- Mantém organizations.white_label_enabled sincronizado com plano e Abençoar.

create or replace function app_private.sync_organization_white_label_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := coalesce(new.organization_id, old.organization_id);

  update public.organizations o
  set white_label_enabled = (
        exists (
          select 1
          from public.platform_church_blessings b
          where b.organization_id = v_organization_id
            and b.active = true
        )
        or exists (
          select 1
          from public.organization_subscriptions os
          where os.organization_id = v_organization_id
            and os.status = 'active'
            and os.plan_code in ('ELO_WHITE_LABEL', 'ELO_REDE')
        )
      ),
      updated_at = now()
  where o.id = v_organization_id;

  return coalesce(new, old);
end;
$$;

revoke all on function app_private.sync_organization_white_label_entitlement()
from public, anon, authenticated;

drop trigger if exists trg_subscription_sync_white_label
on public.organization_subscriptions;
create trigger trg_subscription_sync_white_label
after insert or update or delete
on public.organization_subscriptions
for each row
execute function app_private.sync_organization_white_label_entitlement();

drop trigger if exists trg_blessing_sync_white_label
on public.platform_church_blessings;
create trigger trg_blessing_sync_white_label
after insert or update or delete
on public.platform_church_blessings
for each row
execute function app_private.sync_organization_white_label_entitlement();

update public.organizations o
set white_label_enabled = (
      exists (
        select 1 from public.platform_church_blessings b
        where b.organization_id = o.id and b.active = true
      )
      or exists (
        select 1 from public.organization_subscriptions os
        where os.organization_id = o.id
          and os.status = 'active'
          and os.plan_code in ('ELO_WHITE_LABEL', 'ELO_REDE')
      )
    ),
    updated_at = now();
