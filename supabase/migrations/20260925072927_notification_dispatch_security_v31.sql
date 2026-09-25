create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name='elo_notification_dispatch_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'elo_notification_dispatch_key',
      'Chave interna do dispatcher de notificacoes ELO v3.1'
    );
  end if;

  if not exists (
    select 1 from vault.secrets where name='elo_project_url'
  ) then
    perform vault.create_secret(
      'https://esukjhuyooppxgfmltkb.supabase.co',
      'elo_project_url',
      'URL interna do projeto Nethanel Church para jobs ELO'
    );
  end if;
end
$$;

create or replace function public.verify_notification_dispatch_key(
  p_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name='elo_notification_dispatch_key'
      and s.decrypted_secret=p_key
  );
$$;

revoke all on function public.verify_notification_dispatch_key(text)
  from public, anon, authenticated;
grant execute on function public.verify_notification_dispatch_key(text)
  to service_role;

