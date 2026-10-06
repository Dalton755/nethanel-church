revoke execute on function public.billing_apply_provider_payment_secure(text,text,text,text,integer,text,timestamptz,text,text,jsonb,text) from anon, authenticated, public;
revoke execute on function public.billing_apply_recurring_authorization_secure(text,text,text,date,text,jsonb,text) from anon, authenticated, public;
revoke execute on function public.billing_environment_for_organization(uuid) from anon, authenticated, public;
revoke execute on function public.billing_force_organization_environment() from anon, authenticated, public;
revoke execute on function public.billing_invalidate_mismatched_subscription() from anon, authenticated, public;

grant execute on function public.billing_apply_provider_payment_secure(text,text,text,text,integer,text,timestamptz,text,text,jsonb,text) to service_role, postgres;
grant execute on function public.billing_apply_recurring_authorization_secure(text,text,text,date,text,jsonb,text) to service_role, postgres;
grant execute on function public.billing_environment_for_organization(uuid) to service_role, postgres;
grant execute on function public.billing_force_organization_environment() to service_role, postgres;
grant execute on function public.billing_invalidate_mismatched_subscription() to service_role, postgres;