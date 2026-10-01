-- Area 09 §21 "Overdue team actions" needs a manager to be able to see
-- their direct reports' workflow tasks at all — today only
-- workflow_tasks_hr_full (admin/hr) and workflow_tasks_assignee_read
-- (the task's own assignee) exist, so a manager whose report has an
-- overdue onboarding/offboarding/leave/contract-renewal task currently
-- sees nothing. Mirrors the service_requests_manager_team_read pattern
-- (migration 0075): hrms_current_role()='manager' + is_manager_of(), but
-- resolved per workflow entity_type since workflow_runs.entity_id isn't
-- always an employee id directly (see start-workflow-run.ts call sites).
-- Read-only, and only for the 4 entity types this codebase's workflows
-- actually use — a 5th introduced later simply isn't covered until this
-- policy is extended, not silently over-granted.
create policy "workflow_tasks_manager_team_read" on public.workflow_tasks
  for select using (
    hrms_current_role() = 'manager'
    and exists (
      select 1 from public.workflow_runs wr
      where wr.id = workflow_tasks.workflow_run_id
        and (
          (wr.entity_type = 'employee' and is_manager_of(wr.entity_id))
          or (wr.entity_type = 'offboarding_record' and exists (
                select 1 from public.offboarding_records o where o.id = wr.entity_id and is_manager_of(o.employee_id)))
          or (wr.entity_type = 'leave_request' and exists (
                select 1 from public.leave_requests lr where lr.id = wr.entity_id and is_manager_of(lr.employee_id)))
          or (wr.entity_type = 'employee_document' and exists (
                select 1 from public.employee_documents ed where ed.id = wr.entity_id and is_manager_of(ed.employee_id)))
        )
    )
  );
