-- Area 11 feeds Area 09 (spec §10.3: risk.detected -> Area 09, Area 03;
-- risk.resolved -> Area 10, Area 09). Add the missing "risk" notification
-- category/preference type so these can go through the normal governed
-- notification pipeline rather than a side-channel insert.
alter table notifications drop constraint notifications_category_check;
alter table notifications add constraint notifications_category_check
  check (category = any (array['leave','attendance','payroll','compliance','training','performance','recruitment','offboarding','documents','system','self_service','service_request','approval','risk']));

alter table notification_preferences drop constraint notification_preferences_notification_type_check;
alter table notification_preferences add constraint notification_preferences_notification_type_check
  check (notification_type = any (array['leave','attendance','payroll','compliance','training','performance','recruitment','offboarding','documents','system','self_service','service_request','approval','risk']));
