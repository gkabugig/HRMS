-- Bug found while building the Admin Notification Centre (spec §23 "search
-- by ... recipient", failed-delivery queue): `notifications` has only
-- `notifications_self_read` (recipient_user_id = auth.uid()) as its SELECT
-- policy. `notification_deliveries_hr_read` (0085) was written assuming an
-- admin/hr session could see ANY org notification row via an EXISTS
-- subquery into `notifications` — but RLS applies to that subquery too, so
-- for any notification NOT addressed to the admin/hr user themselves, the
-- subquery silently found nothing and the policy was effectively never
-- granting cross-user visibility. This adds the missing read grant;
-- notifications remains fully un-writable by ordinary sessions (insert
-- stays locked to create_notification_secure(), update/delete stay
-- self-only) — this is read visibility only, for support/audit/admin
-- tooling, never a write path.
create policy "notifications_hr_admin_read" on public.notifications
  for select using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
