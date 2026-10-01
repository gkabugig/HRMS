-- Bug found during Area 05 acceptance testing (live rolled-back RLS test):
-- migration 0066 added a PERMISSIVE "employee_documents_self_insert" policy
-- (with check employee_id = current_employee_id()) intending to let an
-- employee upload their own document — but employee_documents also carries
-- a PRE-EXISTING RESTRICTIVE policy from Area 01's universal RBAC pass
-- (0036_universal_rbac_rls.sql, "employee_documents_insert_rbac") that ANDs
-- against every permissive grant on INSERT and requires the acting user to
-- hold the 'documents'/'edit'/'confidential' RBAC permission at
-- 'organisation' scope. The employee role is never granted that (by
-- design — it's reserved for admin/hr/manager managing documents on
-- others' behalf), so 0066 alone left self-upload still blocked: a
-- RESTRICTIVE-without-matching-PERMISSIVE gap in the opposite direction
-- from the one 0066 was fixing. Confirmed via a rolled-back acceptance-test
-- transaction: an authenticated employee inserting their own document row
-- failed with "new row violates row-level security policy
-- employee_documents_insert_rbac".
--
-- Fix (via ALTER POLICY, not drop+recreate, since this environment's
-- migration tool cancels on DROP): OR in a narrow self-upload carve-out —
-- the acting employee inserting a row that names their OWN employee_id —
-- alongside the original organisation-wide RBAC condition, which stays
-- unchanged for anyone inserting on another employee's behalf (HR/admin/
-- manager still need the 'documents'/'edit'/'confidential' grant for
-- that). This does NOT touch _select_rbac/_update_rbac/_delete_rbac —
-- those still require the RBAC grant for any mutation/view beyond the
-- employee's own insert (spec §9's immutable, HR-governed lifecycle after
-- upload).
alter policy "employee_documents_insert_rbac" on public.employee_documents
  with check (
    (
      exists (select 1 from public.employees e where e.id = employee_id and e.org_id = current_org_id())
      and 'organisation' = any (array(select s from public.rbac_granted_scopes('documents', 'edit', 'confidential') s))
    )
    or employee_id = current_employee_id()
  );
