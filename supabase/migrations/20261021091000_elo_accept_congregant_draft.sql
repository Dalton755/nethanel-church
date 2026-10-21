-- Draft only: run after base migration in isolated homologation.
-- Accept congregant invite atomically, without a second approval.
create or replace function public.elo_accept_congregant_invite(
 p_invitation_id uuid,
 p_full_name text,
 p_birth_date date,
 p_whatsapp text,
 p_marital_status text,
 p_cep text,
 p_street text,
 p_street_number text,
 p_complement text,
 p_neighborhood text,
 p_city text,
 p_state text,
 p_baptism_status text,
 p_baptism_date date default null,
 p_ecclesiastical_title text default null,
 p_department_name text default null
) returns void language plpgsql security definer
set search_path = '' as $$
declare v_inv public.elo_invitations%rowtype;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
 if nullif(btrim(p_full_name),'') is null or p_birth_date is null
    or length(regexp_replace(coalesce(p_whatsapp,''),'[^0-9]','','g')) < 10
    or length(regexp_replace(coalesce(p_cep,''),'[^0-9]','','g')) <> 8
    or nullif(btrim(p_street),'') is null or nullif(btrim(p_street_number),'') is null
    or nullif(btrim(p_city),'') is null or nullif(btrim(p_state),'') is null
    or p_baptism_status not in ('sim','nao','nao_sei')
 then raise exception 'Cadastro incompleto'; end if;
 select * into v_inv from public.elo_invitations
 where id=p_invitation_id for update;
 if not found or v_inv.kind <> 'congregado' or v_inv.status <> 'pending'
    or v_inv.expires_at <= now()
 then raise exception 'Convite inválido ou expirado'; end if;
 if not exists (select 1 from public.people
    where id=v_inv.person_id and organization_id=v_inv.organization_id
      and auth_user_id=auth.uid())
 then raise exception 'Convite pertence a outro usuário'; end if;
 update public.people set full_name=btrim(p_full_name),birth_date=p_birth_date,
   phone=p_whatsapp,updated_at=now()
 where id=v_inv.person_id and organization_id=v_inv.organization_id;
 insert into public.elo_congregant_profiles
 (person_id,organization_id,whatsapp,marital_status,cep,street,street_number,complement,
  neighborhood,city,state,baptism_status,baptism_date,ecclesiastical_title,department_name)
 values(v_inv.person_id,v_inv.organization_id,p_whatsapp,p_marital_status,p_cep,p_street,
   p_street_number,p_complement,p_neighborhood,p_city,p_state,p_baptism_status,
   case when p_baptism_status='sim' then p_baptism_date else null end,
   p_ecclesiastical_title,p_department_name)
 on conflict(person_id) do update set whatsapp=excluded.whatsapp,
 marital_status=excluded.marital_status,cep=excluded.cep,street=excluded.street,
 street_number=excluded.street_number,complement=excluded.complement,
 neighborhood=excluded.neighborhood,city=excluded.city,state=excluded.state,
 baptism_status=excluded.baptism_status,baptism_date=excluded.baptism_date,
 ecclesiastical_title=excluded.ecclesiastical_title,
 department_name=excluded.department_name,updated_at=now();
 update public.organization_memberships set membership_type='congregant',status='active',
 updated_at=now() where person_id=v_inv.person_id and organization_id=v_inv.organization_id;
 if not found then
   insert into public.organization_memberships(organization_id,person_id,membership_type,status)
   values(v_inv.organization_id,v_inv.person_id,'congregant','active');
 end if;
 update public.elo_invitations set status='accepted',accepted_at=now() where id=v_inv.id;
 insert into public.elo_invitation_audit(invitation_id,organization_id,actor_id,action)
 values(v_inv.id,v_inv.organization_id,auth.uid(),'congregant_accepted');
end $$;
revoke all on function public.elo_accept_congregant_invite(uuid,text,date,text,text,text,text,text,text,text,text,text,text,date,text,text) from public,anon;
grant execute on function public.elo_accept_congregant_invite(uuid,text,date,text,text,text,text,text,text,text,text,text,text,date,text,text) to authenticated;
