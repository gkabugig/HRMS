-- Area 05 needs a working "employee uploads their own document" path (Home
-- quick action "Upload Document", document-request fulfilment, and
-- high-sensitivity profile-change evidence) — inspection found this is
-- currently BROKEN for the employee role, a pre-existing gap of the same
-- class Area 04 found and fixed on `employees` (a RESTRICTIVE policy with
-- no PERMISSIVE companion for that role/command):
--   - employee_documents: the only insert-specific policy,
--     employee_documents_insert_rbac (0036), is RESTRICTIVE; the only
--     PERMISSIVE policy covering insert is employee_documents_hr_full
--     (admin/hr only) — so a plain employee has zero permissive grant for
--     INSERT and is denied regardless of what the restrictive policy says.
--   - storage.objects (bucket 'employee-documents'): same shape —
--     employee_docs_hr_full (admin/hr, all commands) and
--     employee_docs_self_read (self, select only) are the only two
--     policies; no permissive self-insert exists either.
-- This means src/lib/documents/actions.ts's fulfilDocumentRequest (already
-- shipped, employee-facing) has been non-functional for the employee role
-- since it was written — first exercised now that Area 05 actually builds
-- a self-upload UI on top of it. Fixed additively, scoped strictly to the
-- caller's own employee_id/folder, mirroring the shape of
-- employee_docs_self_read / document_requests_self_fulfil exactly.

create policy "employee_documents_self_insert" on employee_documents
  for insert
  with check (employee_id = current_employee_id());

create policy "employee_docs_self_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'employee-documents'
    and ((storage.foldername(name))[1])::uuid = current_employee_id()
  );
