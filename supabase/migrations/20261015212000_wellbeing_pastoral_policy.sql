-- Privacy-first pastoral access. Must be applied after member_wellbeing_checkins and consent migrations.
-- Only the member's own organization can see an explicitly shared check-in.
create policy "pastoral can read consented checkins"
on public.member_wellbeing_checkins
for select to authenticated
using (
  share_with_pastoral = true
  and exists (
    select 1
    from public.people viewer
    join public.user_role_assignments assignment
      on assignment.person_id = viewer.id
     and assignment.organization_id = viewer.organization_id
    join public.roles role
      on role.id = assignment.role_id
     and role.organization_id = assignment.organization_id
    where viewer.auth_user_id = (select auth.uid())
      and viewer.organization_id = member_wellbeing_checkins.organization_id
      and assignment.is_active = true
      and role.is_active = true
      and role.role_key in ('pastor', 'pastoral')
      and (assignment.starts_at is null or assignment.starts_at <= now())
      and (assignment.ends_at is null or assignment.ends_at >= now())
  )
);
