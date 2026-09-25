create index if not exists notification_outbox_auth_user_fk_idx
  on app_private.notification_outbox(auth_user_id);

create index if not exists notification_outbox_person_org_fk_idx
  on app_private.notification_outbox(person_id, organization_id);

create index if not exists communication_messages_sender_fk_idx
  on public.communication_messages(sender_user_id);

create index if not exists notification_preferences_org_fk_idx
  on public.notification_preferences(organization_id);

create index if not exists notifications_person_org_fk_idx
  on public.notifications(person_id, organization_id);

