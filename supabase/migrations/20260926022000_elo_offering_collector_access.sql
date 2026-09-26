-- ELO — coleta de ofertas por pessoas escaladas na função de oferta.
-- Acesso é restrito à ocorrência do culto e somente no dia do culto.

create or replace function app_private.can_submit_service_offering(
  p_organization_id uuid,
  p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select exists (
    select 1
    from public.people p
    join public.schedule_assignments sa
      on sa.person_id=p.id
     and sa.organization_id=p.organization_id
    join public.events e
      on e.id=sa.event_id
     and e.organization_id=sa.organization_id
    join public.units u
      on u.id=e.unit_id
     and u.organization_id=e.organization_id
    left join public.schedule_rules sr
      on sr.id=sa.rule_id
     and sr.organization_id=sa.organization_id
    left join public.department_functions df
      on df.id=sr.department_function_id
     and df.organization_id=sr.organization_id
    where p.organization_id=p_organization_id
      and p.auth_user_id=auth.uid()
      and p.record_status='active'
      and sa.event_id=p_event_id
      and sa.status in ('confirmed','completed')
      and e.status<>'cancelled'
      and (now() at time zone u.timezone)::date =
          (e.starts_at at time zone u.timezone)::date
      and (
        lower(coalesce(sa.role_label,'')) like '%oferta%'
        or lower(coalesce(df.name,'')) like '%oferta%'
      )
  );
$function$;

revoke all on function app_private.can_submit_service_offering(uuid,uuid)
from public,anon,authenticated;

create or replace function public.list_my_service_offering_access(
  p_organization_id uuid
)
returns table(
  event_id uuid,
  event_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  unit_id uuid,
  assignment_id uuid,
  role_label text,
  closure_status text,
  total_amount numeric
)
language sql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
  select distinct on (e.id)
    e.id,
    e.title,
    e.starts_at,
    e.ends_at,
    e.unit_id,
    sa.id,
    sa.role_label,
    fc.status,
    fc.total_amount
  from public.people p
  join public.schedule_assignments sa
    on sa.person_id=p.id
   and sa.organization_id=p.organization_id
  join public.events e
    on e.id=sa.event_id
   and e.organization_id=sa.organization_id
  join public.units u
    on u.id=e.unit_id
   and u.organization_id=e.organization_id
  left join public.schedule_rules sr
    on sr.id=sa.rule_id
   and sr.organization_id=sa.organization_id
  left join public.department_functions df
    on df.id=sr.department_function_id
   and df.organization_id=sr.organization_id
  left join public.finance_service_closures fc
    on fc.organization_id=e.organization_id
   and fc.event_id=e.id
  where p.organization_id=p_organization_id
    and p.auth_user_id=auth.uid()
    and p.record_status='active'
    and sa.status in ('confirmed','completed')
    and e.status<>'cancelled'
    and (now() at time zone u.timezone)::date =
        (e.starts_at at time zone u.timezone)::date
    and (
      lower(coalesce(sa.role_label,'')) like '%oferta%'
      or lower(coalesce(df.name,'')) like '%oferta%'
    )
  order by e.id,sa.created_at;
$function$;

revoke all on function public.list_my_service_offering_access(uuid)
from public,anon;
grant execute on function public.list_my_service_offering_access(uuid)
to authenticated;

create or replace function public.get_my_service_offering_entry(
  p_organization_id uuid,
  p_event_id uuid
)
returns table(
  event_id uuid,
  event_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  unit_id uuid,
  closure_id uuid,
  status text,
  cash_amount numeric,
  pix_amount numeric,
  card_amount numeric,
  other_amount numeric,
  total_amount numeric,
  notes text,
  submitted_at timestamptz,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path='public','auth','app_private','pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.can_submit_service_offering(
    p_organization_id,
    p_event_id
  ) then
    raise exception 'Offering entry unavailable for this service'
      using errcode='42501';
  end if;

  return query
  select
    e.id,
    e.title,
    e.starts_at,
    e.ends_at,
    e.unit_id,
    fc.id,
    coalesce(fc.status,'draft'),
    coalesce(fc.cash_amount,0),
    coalesce(fc.pix_amount,0),
    coalesce(fc.card_amount,0),
    coalesce(fc.other_amount,0),
    coalesce(fc.total_amount,0),
    fc.notes,
    fc.submitted_at,
    fc.approved_at
  from public.events e
  left join public.finance_service_closures fc
    on fc.organization_id=e.organization_id
   and fc.event_id=e.id
  where e.organization_id=p_organization_id
    and e.id=p_event_id
  limit 1;
end;
$function$;

revoke all on function public.get_my_service_offering_entry(uuid,uuid)
from public,anon;
grant execute on function public.get_my_service_offering_entry(uuid,uuid)
to authenticated;

create or replace function public.save_my_service_offering_entry(
  p_organization_id uuid,
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
  v_unit_id uuid;
  v_result public.finance_service_closures%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if not app_private.can_submit_service_offering(
    p_organization_id,
    p_event_id
  ) then
    raise exception 'Offering entry unavailable for this service'
      using errcode='42501';
  end if;

  select e.unit_id
  into v_unit_id
  from public.events e
  where e.organization_id=p_organization_id
    and e.id=p_event_id
    and e.status<>'cancelled';

  if v_unit_id is null then
    raise exception 'Service not found';
  end if;

  if least(
    coalesce(p_cash_amount,0),
    coalesce(p_pix_amount,0),
    coalesce(p_card_amount,0),
    coalesce(p_other_amount,0)
  ) < 0 then
    raise exception 'Invalid offering values';
  end if;

  if exists (
    select 1
    from public.finance_service_closures fc
    where fc.organization_id=p_organization_id
      and fc.event_id=p_event_id
      and fc.status in ('submitted','approved')
  ) then
    raise exception 'Offering entry already sent for conference';
  end if;

  insert into public.finance_service_closures(
    organization_id,
    unit_id,
    event_id,
    status,
    cash_amount,
    pix_amount,
    card_amount,
    other_amount,
    notes,
    submitted_by,
    submitted_at,
    created_by
  )
  values(
    p_organization_id,
    v_unit_id,
    p_event_id,
    case when p_submit then 'submitted' else 'draft' end,
    coalesce(p_cash_amount,0),
    coalesce(p_pix_amount,0),
    coalesce(p_card_amount,0),
    coalesce(p_other_amount,0),
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
    status=excluded.status,
    submitted_by=excluded.submitted_by,
    submitted_at=excluded.submitted_at,
    updated_at=now()
  returning * into v_result;

  perform app_private.write_audit(
    p_organization_id,
    v_unit_id,
    case
      when p_submit then 'finance.offering_collector_submitted'
      else 'finance.offering_collector_saved'
    end,
    'finance_service_closures',
    v_result.id,
    jsonb_build_object(
      'event_id',p_event_id,
      'total_amount',v_result.total_amount,
      'status',v_result.status
    )
  );

  return v_result;
end;
$function$;

revoke all on function public.save_my_service_offering_entry(
  uuid,uuid,numeric,numeric,numeric,numeric,text,boolean
) from public,anon;
grant execute on function public.save_my_service_offering_entry(
  uuid,uuid,numeric,numeric,numeric,numeric,text,boolean
) to authenticated;

notify pgrst,'reload schema';
