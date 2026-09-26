delete from public.role_permissions rp
using public.roles r
where rp.role_id=r.id
  and lower(r.role_key) in ('membro','voluntario')
  and rp.permission_key='billing.view';

CREATE OR REPLACE FUNCTION app_private.ensure_elo_system_roles(p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_role record;
begin
  insert into public.roles(
    organization_id,name,role_key,description,is_owner,is_system,is_active
  )
  select p_organization_id, x.name, x.role_key, x.description, false, true, true
  from (values
    ('Administrador','admin','Administração completa do Elo.'),
    ('Pastor','pastor','Visão pastoral e administrativa ampla.'),
    ('Secretário','secretario','Pessoas, famílias, agenda e cadastros.'),
    ('Tesoureiro','tesoureiro','Financeiro, conciliação e auditoria.'),
    ('Líder','lider','Equipe, escalas, comunicação e cuidado autorizado.'),
    ('Voluntário','voluntario','Recursos necessários para servir.'),
    ('Membro','membro','Experiência essencial do membro.')
  ) as x(name,role_key,description)
  where not exists (
    select 1 from public.roles r
    where r.organization_id=p_organization_id
      and lower(r.role_key)=lower(x.role_key)
  );

  insert into public.role_permissions(role_id,permission_key)
  select r.id, rp.permission_key
  from public.roles r
  join (
    values
      ('admin','agenda.manage'),('admin','agenda.view'),('admin','audit.view'),
      ('admin','organization.manage'),('admin','people.manage'),('admin','people.view'),
      ('admin','security.manage'),('admin','services.manage'),('admin','services.view'),
      ('admin','units.manage'),('admin','services.control'),('admin','contributions.create'),
      ('admin','schedules.self'),('admin','schedules.manage'),('admin','community.view'),
      ('admin','community.publish'),('admin','prayer.create'),('admin','kids.parent'),
      ('admin','kids.manage'),('admin','finance.view'),('admin','finance.manage'),
      ('admin','families.view'),('admin','families.manage'),('admin','departments.view'),
      ('admin','departments.manage'),('admin','welcome.view'),('admin','welcome.manage'),
      ('admin','care.view'),('admin','care.manage'),('admin','communication.send'),
      ('admin','billing.view'),('admin','billing.manage'),('admin','system.health.view'),

      ('pastor','agenda.manage'),('pastor','agenda.view'),('pastor','audit.view'),
      ('pastor','people.manage'),('pastor','people.view'),('pastor','services.manage'),
      ('pastor','services.view'),('pastor','services.control'),('pastor','contributions.create'),
      ('pastor','schedules.self'),('pastor','schedules.manage'),('pastor','community.view'),
      ('pastor','community.publish'),('pastor','prayer.create'),('pastor','kids.parent'),
      ('pastor','kids.manage'),('pastor','finance.view'),('pastor','finance.manage'),
      ('pastor','families.view'),('pastor','families.manage'),('pastor','departments.view'),
      ('pastor','departments.manage'),('pastor','welcome.view'),('pastor','welcome.manage'),
      ('pastor','care.view'),('pastor','care.manage'),('pastor','communication.send'),
      ('pastor','billing.view'),

      ('secretario','agenda.manage'),('secretario','agenda.view'),('secretario','people.manage'),
      ('secretario','people.view'),('secretario','services.manage'),('secretario','services.view'),
      ('secretario','contributions.create'),('secretario','schedules.self'),
      ('secretario','community.view'),('secretario','community.publish'),
      ('secretario','prayer.create'),('secretario','kids.parent'),
      ('secretario','families.view'),('secretario','families.manage'),
      ('secretario','departments.view'),('secretario','departments.manage'),
      ('secretario','welcome.view'),('secretario','welcome.manage'),
      ('secretario','communication.send'),('secretario','billing.view'),

      ('tesoureiro','agenda.view'),('tesoureiro','services.view'),
      ('tesoureiro','contributions.create'),('tesoureiro','schedules.self'),
      ('tesoureiro','community.view'),('tesoureiro','prayer.create'),
      ('tesoureiro','kids.parent'),('tesoureiro','finance.view'),
      ('tesoureiro','finance.manage'),('tesoureiro','audit.view'),
      ('tesoureiro','billing.view'),

      ('lider','agenda.view'),('lider','services.view'),('lider','services.control'),
      ('lider','contributions.create'),('lider','schedules.self'),('lider','schedules.manage'),
      ('lider','community.view'),('lider','community.publish'),('lider','prayer.create'),
      ('lider','kids.parent'),('lider','departments.view'),('lider','departments.manage'),
      ('lider','welcome.view'),('lider','welcome.manage'),('lider','care.view'),
      ('lider','care.manage'),('lider','communication.send'),('lider','billing.view'),

      ('voluntario','agenda.view'),('voluntario','services.view'),
      ('voluntario','contributions.create'),('voluntario','schedules.self'),
      ('voluntario','community.view'),('voluntario','prayer.create'),
      ('voluntario','kids.parent'),('voluntario','departments.view'),

      ('membro','agenda.view'),('membro','services.view'),('membro','contributions.create'),
      ('membro','schedules.self'),('membro','community.view'),('membro','prayer.create'),
      ('membro','kids.parent')
  ) as rp(role_key,permission_key)
    on lower(r.role_key)=lower(rp.role_key)
  where r.organization_id=p_organization_id
    and r.is_active=true
  on conflict (role_id,permission_key) do nothing;

  insert into public.organization_subscriptions(organization_id,plan_code,status)
  values(p_organization_id,'GRATUITO','active')
  on conflict (organization_id) do nothing;
end;
$function$

