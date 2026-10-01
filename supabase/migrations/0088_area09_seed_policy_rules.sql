-- Area 09 §34 Suggested Seed Policy Configuration, adapted to this repo's
-- priority vocabulary (spec's 'high'→'action_required', 'critical'
-- stays 'critical') and seeded for every existing organisation.
insert into public.notification_policy_rules
  (org_id, event_type, category, priority, mandatory, allowed_channels, fallback_channels, dedupe_window_seconds, max_per_hour, quiet_hours_allowed, escalation_after_minutes)
select
  o.id, v.event_type, v.category, v.priority, v.mandatory, v.allowed_channels, v.fallback_channels, v.dedupe_window_seconds, v.max_per_hour, v.quiet_hours_allowed, v.escalation_after_minutes
from public.organizations o
cross join (values
  ('approval.requested', 'approval', 'action_required', true, array['in_app','email'], array['email'], 300, 20, false, 1440),
  ('approval.approved', 'approval', 'information', false, array['in_app','email'], array[]::text[], 300, 20, true, null),
  ('approval.rejected', 'approval', 'action_required', false, array['in_app','email'], array['email'], 300, 20, false, null),
  ('approval.escalated', 'approval', 'action_required', true, array['in_app','email'], array['email'], 300, 20, false, null),
  ('workflow.task.assigned', 'approval', 'action_required', false, array['in_app','email'], array[]::text[], 300, 20, false, null),
  ('workflow.task.overdue', 'approval', 'critical', true, array['in_app','email'], array['email'], 300, 20, true, null),
  ('hr.case.created', 'service_request', 'information', false, array['in_app'], array[]::text[], 300, 30, true, null),
  ('hr.case.assigned', 'service_request', 'action_required', false, array['in_app','email'], array[]::text[], 300, 30, false, null),
  ('hr.case.sla_warning', 'service_request', 'action_required', true, array['in_app','email'], array['email'], 3600, 20, false, null),
  ('hr.case.sla_breached', 'service_request', 'critical', true, array['in_app','email'], array['email'], 3600, 20, true, null),
  ('document.acknowledgement.required', 'documents', 'action_required', true, array['in_app','email'], array['email'], 3600, 10, false, 2880),
  ('document.expiry.warning', 'documents', 'reminder', false, array['in_app','email'], array['email'], 86400, 5, true, null),
  ('document.expired', 'documents', 'action_required', true, array['in_app','email'], array['email'], 86400, 5, false, null),
  ('document.issued', 'documents', 'information', false, array['in_app'], array[]::text[], 3600, 10, true, null)
) as v(event_type, category, priority, mandatory, allowed_channels, fallback_channels, dedupe_window_seconds, max_per_hour, quiet_hours_allowed, escalation_after_minutes)
on conflict (org_id, event_type) do nothing;
