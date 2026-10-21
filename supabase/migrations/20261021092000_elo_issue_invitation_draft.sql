-- Staging only: issue an invitation from an authorized administrator.
create or replace function public.elo_issue_invitation(
 p_person_id uuid, p_kind text, p_department_id uuid default null
) returns uuid language plpgsql security definer
set search_path='' as $$
declare v_org uuid; v_actor_person uuid; v_id uuid;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
 if p_kind not in ('congregado','pastor','tesoureiro','midia','secretaria','lider_departamento')
 then raise exception 'Tipo de convite inválido'; end if;
 select organization_id into v_org from public.people where id=p_person_id;
 if v_org is null then raise exception 'Destinatário não encontrado'; end if;
 select id into v_actor_person from public.people
 where organization_id=v_org and auth_user_id=auth.uid() limit 1;
 if v_actor_person is null or not exists (
 select 1 from public.user_role_assignments a
 join public.roles r on r.id=a.role_id and r.organization_id=a.organization_id
 where a.organization_id=v_org and a.person_id=v_actor_person and a.is_active=true
 and (a.ends_at is null or a.ends_at>now())
 and r.is_active=true and r.role_key in ('admin','owner')
 ) then raise exception 'Sem permissão para emitir convites'; end if;
 if p_kind='lider_departamento' and p_department_id is null
 then raise exception 'Departamento obrigatório'; end if;
 if exists(select 1 from public.elo_invitations
 where organization_id=v_org and person_id=p_person_id and kind=p_kind
 and status='pending' and expires_at>now()) then
 raise exception 'Já existe convite pendente para essa função'; end if;
 update public.elo_invitations set status='expired'
 where organization_id=v_org and person_id=p_person_id and kind=p_kind
 and status='pending' and expires_at<=now();
 insert into public.elo_invitations(organization_id,person_id,invited_by,kind,department_id)
 values(v_org,p_person_id,auth.uid(),p_kind,p_department_id) returning id into v_id;
 insert into public.elo_invitation_audit(invitation_id,organization_id,actor_id,action)
 values(v_id,v_org,auth.uid(),'issued');
 return v_id;
end $$;
revoke all on function public.elo_issue_invitation(uuid,text,uuid) from public,anon;
grant execute on function public.elo_issue_invitation(uuid,text,uuid) to authenticated;
