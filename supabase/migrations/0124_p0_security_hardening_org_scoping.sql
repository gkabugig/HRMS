-- P0 SECURITY HARDENING (SEC-001 / SEC-005): close a systemic cross-tenant
-- gap identical in shape to the one migration 0025 already fixed for
-- approval_steps/approval_actions/workflow_tasks/workflow_logs/
-- service_request_tasks. These ~16 tables (plus the matching storage.objects
-- policy for the employee-documents bucket) were left on the original,
-- never-revisited "hrms_current_role() in ('admin','hr')" shape with NO
-- org_id check at all. hrms_current_role() reports only the caller's ROLE,
-- never their organisation, so as written any admin/hr user in ANY
-- organisation can read and write every OTHER organisation's rows on these
-- tables via a direct PostgREST/Supabase client call (bypassing the app's
-- own org-scoped queries entirely) as long as they know or can guess a row
-- id. This migration applies the exact same fix pattern 0025 already
-- established: join back to whichever parent row actually carries org_id
-- (directly, or transitively through employees/offboarding_records/
-- requisitions/service_requests) and require org_id = current_org_id()
-- there. No table here has an org_id column of its own to add directly.
--
-- For "for all" policies, PostgreSQL uses the USING clause as the implicit
-- WITH CHECK when none is given, so (as with 0025) a single USING clause is
-- sufficient to also gate INSERT/UPDATE.

-- ============ EMPLOYEE AUDIT LOG ============

drop policy "audit_hr_full" on employee_audit_log;
create policy "audit_hr_full" on employee_audit_log
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ RECRUITMENT / ONBOARDING ============
-- onboarding_tasks has no employee_id or org_id of its own - it only
-- reaches an org by a two-hop join through candidates -> requisitions.

drop policy "onboarding_tasks_hr_full" on onboarding_tasks;
create policy "onboarding_tasks_hr_full" on onboarding_tasks
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (
      select 1 from candidates c
      join requisitions r on r.id = c.requisition_id
      where c.id = candidate_id and r.org_id = current_org_id()
    )
  );

-- ============ ATTENDANCE ============

drop policy "attendance_hr_full" on attendance;
create policy "attendance_hr_full" on attendance
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ LEAVE ============

drop policy "leave_hr_full" on leave_requests;
create policy "leave_hr_full" on leave_requests
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ PAYROLL ============

drop policy "advances_hr_full" on salary_advances;
create policy "advances_hr_full" on salary_advances
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ PERFORMANCE ============

drop policy "appraisals_hr_full" on appraisals;
create policy "appraisals_hr_full" on appraisals
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ LEARNING & DEVELOPMENT ============

drop policy "enrollments_hr_full" on training_enrollments;
create policy "enrollments_hr_full" on training_enrollments
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ COMPLIANCE ============

drop policy "policy_acks_hr_full" on policy_acknowledgments;
create policy "policy_acks_hr_full" on policy_acknowledgments
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ OFFBOARDING ============

drop policy "offboarding_hr_full" on offboarding_records;
create policy "offboarding_hr_full" on offboarding_records
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- offboarding_assets has no employee_id of its own - one hop through
-- offboarding_records, then the same employees.org_id check.
drop policy "offboarding_assets_hr_full" on offboarding_assets;
create policy "offboarding_assets_hr_full" on offboarding_assets
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (
      select 1 from offboarding_records o
      join employees e on e.id = o.employee_id
      where o.id = offboarding_id and e.org_id = current_org_id()
    )
  );

-- ============ EMPLOYEE DOCUMENTS (table + storage bucket) ============

drop policy "employee_documents_hr_full" on employee_documents;
create policy "employee_documents_hr_full" on employee_documents
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- The storage.objects policy for this bucket had the identical gap: an
-- admin/hr user from any org could read/overwrite any org's uploaded files,
-- since storage RLS is evaluated independently of the employee_documents
-- table policy above. Object paths are "<employeeId>/..." (see
-- employee_docs_self_read below, and buildDocumentStoragePath in
-- src/lib/documents/upload.ts), so the same employees.org_id check applies
-- via the first path segment.
drop policy "employee_docs_hr_full" on storage.objects;
create policy "employee_docs_hr_full" on storage.objects
  for all using (
    bucket_id = 'employee-documents'
    and hrms_current_role() in ('admin','hr')
    and exists (
      select 1 from employees e
      where e.id = ((storage.foldername(name))[1])::uuid
        and e.org_id = current_org_id()
    )
  );

-- ============ EMPLOYEE 360 ============

drop policy "employee_contacts_hr_full" on employee_contacts;
create policy "employee_contacts_hr_full" on employee_contacts
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

drop policy "employee_assets_hr_full" on employee_assets;
create policy "employee_assets_hr_full" on employee_assets
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

drop policy "employee_comp_history_hr_full" on employee_compensation_history;
create policy "employee_comp_history_hr_full" on employee_compensation_history
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

drop policy "employee_job_history_hr_full" on employee_job_history;
create policy "employee_job_history_hr_full" on employee_job_history
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

drop policy "employee_notes_hr_full" on employee_notes;
create policy "employee_notes_hr_full" on employee_notes
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ SERVICE REQUESTS ============

drop policy "service_request_messages_hr_full" on service_request_messages;
create policy "service_request_messages_hr_full" on service_request_messages
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from service_requests sr where sr.id = service_request_id and sr.org_id = current_org_id())
  );
