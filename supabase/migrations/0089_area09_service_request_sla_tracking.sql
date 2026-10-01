-- Area 09 hr.case.sla_warning/hr.case.sla_breached need a "have I already
-- notified for this" marker, same pattern as document_expiries.notified_at
-- (Area 08) — service_requests.sla_due_at existed before Area 09 but
-- nothing ever evaluated it (confirmed: no sweep, no cron, only displayed
-- in the UI). These columns are additive/nullable, no behavior change for
-- any existing row until the new sweep (service-requests/sla-sweep.ts)
-- starts setting them.
alter table public.service_requests
  add column if not exists sla_warning_notified_at timestamptz,
  add column if not exists sla_breach_notified_at timestamptz;
