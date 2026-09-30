-- Phase 2 adds two new notification-worthy areas (self-service profile
-- change requests, and HR service requests/case updates) that don't fit
-- any existing category. Widening the check constraint rather than
-- overloading 'system' for both, so the Notifications centre's per-category
-- preferences (notification_preferences) can still be set independently.
alter table notifications drop constraint notifications_category_check;
alter table notifications add constraint notifications_category_check check (category in
  ('leave','attendance','payroll','compliance','training','performance','recruitment','offboarding','documents','system','self_service','service_request'));
