-- Area 08 §21 Acknowledgement Engine — extend the existing
-- document_acknowledgements table (migration 0064) to bind an
-- acknowledgement to a specific version and support the full
-- pending/viewed/acknowledged/declined/expired status set, rather than
-- creating a parallel table. "Opening a document is not the same as
-- acknowledging it" (spec §21) — viewed_at is tracked separately from
-- acknowledged_at.
--
-- The existing unique(document_id, employee_id) constraint prevented a
-- second acknowledgement row once a document got a new version — exactly
-- the "reset on new version" behaviour the spec requires, so it's widened
-- to unique(document_id, employee_id, version_id). version_id is nullable
-- for any pre-existing row with no version on record; going forward every
-- new row carries one. Per this session's established, verified-safe
-- pattern for widening a plain table constraint (not a POLICY or TABLE,
-- which this environment's migration tool silently cancels), this uses
-- `drop constraint` + `add constraint` directly.
alter table public.document_acknowledgements
  add column if not exists version_id uuid references public.document_versions(id),
  add column if not exists status text not null default 'acknowledged'
    check (status in ('pending', 'viewed', 'acknowledged', 'declined', 'expired')),
  add column if not exists viewed_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text;

alter table public.document_acknowledgements
  drop constraint if exists document_acknowledgements_document_id_employee_id_key;

alter table public.document_acknowledgements
  add constraint document_acknowledgements_document_employee_version_key
  unique (document_id, employee_id, version_id);

create index if not exists idx_document_acknowledgements_version_id on public.document_acknowledgements(version_id);
