-- Area 08 §27 Retention & Legal Hold — DB-level backstop. retention.ts
-- already guards voidDocument()/archiveDocument() at the application layer,
-- but "enforce authorization server-side AND with RLS — UI hiding is not
-- security" (spec §2) means a legal hold must not be only an application
-- convention: any direct table write (a REST call from the browser using
-- an authenticated session, bypassing the Server Action entirely) must be
-- stopped too. RLS alone can't express "compare OLD.legal_hold to
-- NEW.lifecycle_state" cleanly across USING/WITH CHECK, so this is a
-- BEFORE UPDATE trigger — the correct tool for an OLD-vs-NEW invariant.
--
-- Deliberately not overridable from inside this trigger (no session flag,
-- no role bypass): the only way to end a held document's lifecycle is to
-- clear legal_hold first, in its own update, which is exactly the "must
-- prevent uncontrolled deletion" requirement — a hold that something in
-- the same request can quietly skip past is not a hold.
create or replace function public.enforce_document_retention()
returns trigger
language plpgsql
as $$
begin
  if old.legal_hold = true and new.lifecycle_state in ('voided', 'archived') and new.lifecycle_state <> old.lifecycle_state then
    raise exception 'This document is under legal hold and cannot be voided or archived.';
  end if;
  if old.retention_until is not null and old.retention_until > current_date
     and new.lifecycle_state in ('voided', 'archived') and new.lifecycle_state <> old.lifecycle_state then
    raise exception 'This document is under retention until % and cannot be voided or archived yet.', old.retention_until;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_document_retention
  before update on public.employee_documents
  for each row
  execute function public.enforce_document_retention();
