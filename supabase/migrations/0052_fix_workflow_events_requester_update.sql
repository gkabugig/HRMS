-- Same class of gap as 0051: startWorkflowFromEvent marks the event row it
-- just processed ('processed'/'skipped'/'failed') using the SAME caller's
-- client that published it (an employee, for Employee Data Change) — but
-- workflow_events only had workflow_events_hr_update (admin/hr only), so a
-- plain employee's own event would be stuck unable to be marked processed.
-- Safe to make this as permissive as the existing read policy
-- (workflow_events_org_read, 0047) since both already share the same
-- org-scoped shape — no narrower "owner" concept exists for an event the
-- way it does for workflow_runs (an event has no requester column).
create policy "workflow_events_org_update" on public.workflow_events
  for update to authenticated
  using (org_id = current_org_id())
  with check (org_id = current_org_id());
