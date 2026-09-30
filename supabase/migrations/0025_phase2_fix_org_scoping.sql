-- Security fix: several Phase 2 "hr full access" policies on child tables
-- that have no org_id column of their own (approval_steps, approval_actions,
-- workflow_tasks, workflow_logs, service_request_tasks) were written as
-- "hrms_current_role() in ('admin','hr')" with no org check at all. Since
-- hrms_current_role() only reports the caller's role, not their org, this
-- let any admin/hr user read and write every org's rows on these tables,
-- not just their own — a cross-tenant leak. Only one org exists in this
-- deployment today so nothing was actually exposed, but it's a real gap in
-- code that's now live, so closing it immediately rather than letting it
-- ride until the second org shows up.
--
-- Fix: replace each with a version that joins back to the parent row that
-- does carry org_id (approval_requests, workflow_runs, service_requests)
-- and checks org_id = current_org_id() there.

drop policy "approval_steps_hr_full" on approval_steps;
create policy "approval_steps_hr_full" on approval_steps
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from approval_requests r where r.id = approval_request_id and r.org_id = current_org_id())
  );

drop policy "approval_actions_hr_read" on approval_actions;
create policy "approval_actions_hr_read" on approval_actions
  for select using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from approval_requests r where r.id = approval_request_id and r.org_id = current_org_id())
  );

drop policy "workflow_tasks_hr_full" on workflow_tasks;
create policy "workflow_tasks_hr_full" on workflow_tasks
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from workflow_runs wr where wr.id = workflow_run_id and wr.org_id = current_org_id())
  );

drop policy "workflow_logs_hr_read" on workflow_logs;
create policy "workflow_logs_hr_read" on workflow_logs
  for select using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from workflow_runs wr where wr.id = workflow_run_id and wr.org_id = current_org_id())
  );

drop policy "service_request_tasks_hr_full" on service_request_tasks;
create policy "service_request_tasks_hr_full" on service_request_tasks
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from service_requests sr where sr.id = service_request_id and sr.org_id = current_org_id())
  );
