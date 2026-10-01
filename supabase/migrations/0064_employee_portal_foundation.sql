-- Area 05: Employee Portal / Employee Self-Service — schema foundation.
-- Per the spec's own "do not duplicate master data" rule, this adds only the
-- genuinely missing pieces identified by inspecting the live schema first:
--   1. emergency contact / next of kin fields on employees (spec §5 "Next of
--      kin"/"Address/emergency contact" field groups — confirmed absent
--      anywhere in the repo before this migration).
--   2. a sensitivity + evidence column on the EXISTING profile_change_requests
--      table, so bank/national-ID/statutory-ID changes reuse the exact same
--      generic approval+apply pipeline (profile-change-actions.ts +
--      apply_profile_change workflow action, both already field-agnostic —
--      `.update({ [field]: newValue })`) instead of a parallel mechanism,
--      just flagged 'confidential' and evidence-gated at submission time.
--   3. requires_acknowledgement + archived_at on employee_documents, and a
--      new document_acknowledgements table — spec §9's "lifecycle"/
--      "acknowledgements" requirements, confirmed to not exist at all.
--      Expiring/Expired remain computed from expiry_date at query time
--      (no new status enum values) rather than adding a cron-maintained
--      status, since nothing already flips status on expiry and that's out
--      of this migration's scope.
--   4. attendance_correction_requests — spec §6/§21's employee-submitted
--      correction request with manager/HR approval routing. The existing
--      correctAttendance()/attendance_corrections mechanism (src/lib/
--      attendance/correct-attendance.ts) is a DIRECT correction tool for
--      managers/HR/admin only (canCorrectAttendance(role)) — there was no
--      employee-submitted *request* path before this. This table captures
--      the request; the existing attendance domain service still applies it
--      on approval (never bypassed), per spec §21 item 15.

alter table employees
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists next_of_kin_name text,
  add column if not exists next_of_kin_phone text,
  add column if not exists next_of_kin_relationship text;

alter table profile_change_requests
  add column if not exists sensitivity text not null default 'normal' check (sensitivity in ('normal','confidential')),
  add column if not exists evidence_document_id uuid references employee_documents(id);

alter table employee_documents
  add column if not exists requires_acknowledgement boolean not null default false,
  add column if not exists archived_at timestamptz;

create table if not exists document_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  document_id uuid not null references employee_documents(id),
  employee_id uuid not null references employees(id),
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (document_id, employee_id)
);
create index if not exists idx_document_acknowledgements_employee on document_acknowledgements(employee_id);

alter table document_acknowledgements enable row level security;

create policy "document_acknowledgements_hr_full" on document_acknowledgements
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "document_acknowledgements_self_read" on document_acknowledgements
  for select using (employee_id = current_employee_id());

create policy "document_acknowledgements_self_insert" on document_acknowledgements
  for insert with check (employee_id = current_employee_id());

create table if not exists attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  work_date date not null,
  field text not null check (field in ('clock_in','clock_out')),
  requested_value text not null,
  reason text not null,
  evidence_document_id uuid references employee_documents(id),
  status text not null default 'Submitted' check (status in ('Submitted','Under Review','Approved','Rejected','Cancelled')),
  approval_request_id uuid references approval_requests(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists idx_attendance_correction_requests_employee on attendance_correction_requests(org_id, employee_id, created_at desc);

alter table attendance_correction_requests enable row level security;

create policy "attendance_correction_requests_hr_full" on attendance_correction_requests
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "attendance_correction_requests_self_read" on attendance_correction_requests
  for select using (employee_id = current_employee_id());

create policy "attendance_correction_requests_self_insert" on attendance_correction_requests
  for insert with check (employee_id = current_employee_id());

-- Employee can withdraw their own request only while it's still Submitted
-- (not yet Under Review/decided) — narrow self-update, mirrors
-- document_requests_self_fulfil's shape but constrained to one transition.
create policy "attendance_correction_requests_self_cancel" on attendance_correction_requests
  for update using (employee_id = current_employee_id() and status = 'Submitted')
  with check (employee_id = current_employee_id() and status = 'Cancelled');
