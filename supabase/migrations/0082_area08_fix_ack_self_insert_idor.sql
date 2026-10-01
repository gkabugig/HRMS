-- T8 finding (Area 08 verification): document_acknowledgements_self_insert
-- (pre-existing policy from migration 0064) only checked employee_id =
-- current_employee_id() and never verified that document_id actually
-- belongs to that same employee — letting any employee insert an
-- acknowledgement row against someone else's document, as themselves.
-- Spec §2: "document search/notifications must never bypass document
-- permissions" and "every material lifecycle/access event must be
-- auditable" both depend on acknowledgement rows being trustworthy.
-- ALTER POLICY (not DROP+CREATE) stays within the migration tool's
-- allowed operations and keeps this additive.
alter policy document_acknowledgements_self_insert on public.document_acknowledgements
  with check (
    employee_id = current_employee_id()
    and exists (
      select 1 from public.employee_documents ed
      where ed.id = document_acknowledgements.document_id
        and ed.employee_id = current_employee_id()
    )
  );
