revoke all on function public.billing_save_payer_profile(uuid,text,text,text,text) from public, anon;
grant execute on function public.billing_save_payer_profile(uuid,text,text,text,text) to authenticated;

revoke all on function public.billing_get_payment_context(uuid) from public, anon;
grant execute on function public.billing_get_payment_context(uuid) to authenticated;

revoke all on function public.billing_prepare_invoice(uuid,text,text,text) from public, anon;
grant execute on function public.billing_prepare_invoice(uuid,text,text,text) to authenticated;

revoke all on function public.billing_get_cancel_context_v2(uuid) from public, anon;
grant execute on function public.billing_get_cancel_context_v2(uuid) to authenticated;

revoke all on function public.billing_prepare_checkout_v2(uuid,text,text) from public, anon;
grant execute on function public.billing_prepare_checkout_v2(uuid,text,text) to authenticated;
