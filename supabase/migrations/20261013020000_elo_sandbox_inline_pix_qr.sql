-- Nethanel Elo Demo: QR Pix diretamente no app (apenas Sandbox).
-- Mantém as cobranças antigas por link e não altera financeiro das igrejas.
alter table public.elo_developer_donations
 add column if not exists provider_pix_qr_id text,
 add column if not exists pix_payload text,
 add column if not exists pix_expires_at timestamptz;

create unique index if not exists elo_developer_donations_pix_qr_uidx
 on public.elo_developer_donations(provider_pix_qr_id)
 where provider_pix_qr_id is not null;

alter table public.elo_developer_donations
 add constraint elo_developer_donations_pix_qr_sandbox_only
 check (provider_pix_qr_id is null or (
   environment = 'sandbox' and
   organization_id = '101212c5-6e81-4915-ae9a-fbde5b42bb04'::uuid and
   payment_method = 'pix' and frequency = 'once'
 )) not valid;
alter table public.elo_developer_donations
 validate constraint elo_developer_donations_pix_qr_sandbox_only;

notify pgrst, 'reload schema';
