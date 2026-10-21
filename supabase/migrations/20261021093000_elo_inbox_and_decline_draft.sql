-- Homologação: consulta e recusa de convites autenticados.
-- Não expor convites de outras pessoas ou organizações.
create or replace function public.elo_my_invitations()
returns table(id uuid, organization_id uuid, organization_name text,
 kind text, status text, expires_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select i.id,i.organization_id,o.name,i.kind,i.status,i.expires_at,i.created_at
 from public.elo_invitations i
 join public.organizations o on o.id=i.organization_id
 join public.people p on p.id=i.person_id and p.organization_id=i.organization_id
 where p.auth_user_id=auth.uid()
 order by i.created_at desc
 limit 100
$$;
revoke all on function public.elo_my_invitations() from public,anon;
grant execute on function public.elo_my_invitations() to authenticated;

create or replace function public.elo_decline_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_inv public.elo_invitations%rowtype;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
 select * into v_inv from public.elo_invitations where id=p_invitation_id for update;
 if not found or v_inv.status<>'pending' or v_inv.expires_at<=now()
 then raise exception 'Convite indisponível'; end if;
 if not exists(select 1 from public.people p where p.id=v_inv.person_id
 and p.organization_id=v_inv.organization_id and p.auth_user_id=auth.uid())
 then raise exception 'Convite não pertence ao usuário'; end if;
 update public.elo_invitations set status='declined' where id=v_inv.id;
 insert into public.elo_invitation_audit(invitation_id,organization_id,actor_id,action)
 values(v_inv.id,v_inv.organization_id,auth.uid(),'declined');
end $$;
revoke all on function public.elo_decline_invitation(uuid) from public,anon;
grant execute on function public.elo_decline_invitation(uuid) to authenticated;
