-- Area 09 §22 Preference Groups ("Workflow", "Informational" etc.) need
-- users to be able to set a preference row for the three Area 09
-- categories (approval, service_request, self_service), and digest.ts
-- already implements weekly digests per §17 — but two check constraints
-- from the pre-Area-09 schema silently blocked both: notification_type
-- was capped at the original 10 category values, and digest_mode never
-- allowed 'weekly'. Without this, the preferences save form would 23514
-- on any user who has (or whose org now emits) one of these categories.
alter table public.notification_preferences
  drop constraint if exists notification_preferences_notification_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_notification_type_check
  check (notification_type = any (array['leave','attendance','payroll','compliance','training','performance','recruitment','offboarding','documents','system','approval','service_request','self_service']));

alter table public.notification_preferences
  drop constraint if exists notification_preferences_digest_mode_check;
alter table public.notification_preferences
  add constraint notification_preferences_digest_mode_check
  check (digest_mode = any (array['instant','daily','weekly','off']));
