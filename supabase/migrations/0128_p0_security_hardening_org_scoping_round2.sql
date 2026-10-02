-- P0 SECURITY HARDENING (SEC-001/SEC-005), round 2.
--
-- 0124 closed the first batch of unscoped "hrms_current_role() in
-- ('admin','hr')" policies found by the manual source audit. Writing a
-- static regression test afterwards (tests/security/rls-org-scoping.test.ts
-- - which mechanically scans every migration for this exact policy shape)
-- turned up 13 MORE tables with the identical gap that the manual audit
-- missed, plus two false positives confirmed safe on inspection and left
-- alone (see the test file's own notes): rbac_permissions_admin_manage
-- (rbac_permissions is a global resource/action catalog with no org_id
-- column at all - there is nothing to scope), and the two
-- service_request_status_history policies are handled directly below
-- rather than being false positives.
--
-- Same fix pattern as 0124/0025 throughout: join back to whichever row
-- actually carries org_id, and rely on "for all"/"for update" using USING
-- as the implicit WITH CHECK where none is given.

-- ============ PERFORMANCE ============

drop policy "appraisal_goals_hr_full" on appraisal_goals;
create policy "appraisal_goals_hr_full" on appraisal_goals
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (
      select 1 from appraisals a join employees e on e.id = a.employee_id
      where a.id = appraisal_id and e.org_id = current_org_id()
    )
  );

-- ============ COMPLIANCE / DISCIPLINARY ============

drop policy "disciplinary_hr_full" on disciplinary_actions;
create policy "disciplinary_hr_full" on disciplinary_actions
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

drop policy "disciplinary_attachments_hr_full" on disciplinary_attachments;
create policy "disciplinary_attachments_hr_full" on disciplinary_attachments
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- Storage objects for the disciplinary-documents bucket: paths are
-- "<employee_id>/<disciplinary_action_id>/<filename>" (0010's own comment),
-- so the same employees.org_id check applies via the first path segment,
-- mirroring 0124's fix for the employee-documents bucket.
drop policy "disciplinary_docs_hr_full" on storage.objects;
create policy "disciplinary_docs_hr_full" on storage.objects
  for all using (
    bucket_id = 'disciplinary-documents'
    and hrms_current_role() in ('admin','hr')
    and exists (
      select 1 from employees e
      where e.id = ((storage.foldername(name))[1])::uuid
        and e.org_id = current_org_id()
    )
  );

-- ============ SHIFTS ============

drop policy "employee_shifts_hr_full" on employee_shifts;
create policy "employee_shifts_hr_full" on employee_shifts
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ ASSIGNMENTS ============

drop policy "assignments_hr_full" on assignments;
create policy "assignments_hr_full" on assignments
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ ATTENDANCE ============

drop policy "attendance_corrections_hr_full" on attendance_corrections;
create policy "attendance_corrections_hr_full" on attendance_corrections
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ POSITIONS / REPORTING ============

drop policy "employee_positions_hr_full" on employee_positions;
create policy "employee_positions_hr_full" on employee_positions
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

drop policy "reporting_rel_hr_full" on reporting_relationships;
create policy "reporting_rel_hr_full" on reporting_relationships
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ DOCUMENTS (access log) ============

drop policy "document_access_logs_hr_read" on document_access_logs;
create policy "document_access_logs_hr_read" on document_access_logs
  for select using (
    hrms_current_role() in ('admin','hr')
    and exists (
      select 1 from employee_documents d join employees e on e.id = d.employee_id
      where d.id = document_id and e.org_id = current_org_id()
    )
  );

-- ============ SELF-SERVICE ============

drop policy "profile_change_requests_hr_full" on profile_change_requests;
create policy "profile_change_requests_hr_full" on profile_change_requests
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from employees e where e.id = employee_id and e.org_id = current_org_id())
  );

-- ============ SERVICE REQUESTS (status history) ============

drop policy "service_request_status_history_hr_read" on service_request_status_history;
create policy "service_request_status_history_hr_read" on service_request_status_history
  for select using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from service_requests sr where sr.id = service_request_id and sr.org_id = current_org_id())
  );

drop policy "service_request_status_history_insert" on service_request_status_history;
create policy "service_request_status_history_insert" on service_request_status_history
  for insert with check (
    (
      hrms_current_role() in ('admin','hr')
      and exists (select 1 from service_requests sr where sr.id = service_request_id and sr.org_id = current_org_id())
    )
    or exists (select 1 from service_requests sr where sr.id = service_request_id and sr.employee_id = current_employee_id())
  );

-- ============ EMPLOYEE PHOTOS (storage) ============

-- Path is "{employee_id}/photo.{ext}" (0121's own comment) - same
-- first-path-segment org check as the documents buckets above.
drop policy "employee_photos_hr_write" on storage.objects;
create policy "employee_photos_hr_write" on storage.objects
  for all using (
    bucket_id = 'employee-photos'
    and hrms_current_role() in ('admin','hr')
    and exists (
      select 1 from employees e
      where e.id = ((storage.foldername(name))[1])::uuid
        and e.org_id = current_org_id()
    )
  )
  with check (
    bucket_id = 'employee-photos'
    and hrms_current_role() in ('admin','hr')
    and exists (
      select 1 from employees e
      where e.id = ((storage.foldername(name))[1])::uuid
        and e.org_id = current_org_id()
    )
  );
