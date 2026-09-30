-- Employee 360: supporting tables for the single-profile employee workspace
-- (see HRMS_Employee_360_Build_Specification.docx). Reuses everything that
-- already exists (employees, attendance, leave_requests, payslips,
-- appraisals, training_enrollments, compliance_documents, disciplinary_actions,
-- offboarding_records, employee_audit_log) and adds only what's missing:
-- contacts, a richer asset register, compensation/job history, and
-- controlled HR/manager notes. `employee_documents` already exists (0012)
-- as the personnel document vault, so this adds the spec's issue/expiry/
-- visibility columns to it instead of creating a duplicate table.

create type employee_document_visibility as enum ('HR', 'Manager', 'Employee');
create type employee_asset_status as enum ('Assigned', 'Returned', 'Lost', 'Damaged');
create type employee_note_visibility as enum ('HR', 'Manager');

-- ---- Extend the existing personnel document vault ----
alter table employee_documents add column issue_date date;
alter table employee_documents add column expiry_date date;
alter table employee_documents add column visibility employee_document_visibility not null default 'HR';

-- A document a manager has been given visibility into (e.g. a certificate
-- relevant to their team), on top of the existing HR-full / self-read
-- policies from 0012.
create policy "employee_documents_manager_visible" on employee_documents
  for select using (
    hrms_current_role() = 'manager'
    and visibility = 'Manager'
    and is_manager_of(employee_id)
  );

-- ---- Emergency / next-of-kin contacts ----
create table employee_contacts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  contact_type text not null default 'Emergency',
  name text not null,
  relationship text,
  phone text,
  email text,
  address text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_employee_contacts_employee on employee_contacts(employee_id);
alter table employee_contacts enable row level security;

create policy "employee_contacts_hr_full" on employee_contacts
  for all using (hrms_current_role() in ('admin','hr'));

create policy "employee_contacts_self_read" on employee_contacts
  for select using (employee_id = current_employee_id());

-- ---- Company property register (richer than the general Assignments
-- module's type='Asset' rows — this is what the Employee 360 Assets tab
-- reads and writes) ----
create table employee_assets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  asset_type text not null,
  asset_tag text,
  serial_no text,
  issued_on date not null default current_date,
  returned_on date,
  condition text,
  status employee_asset_status not null default 'Assigned',
  notes text
);

create index idx_employee_assets_employee on employee_assets(employee_id);
alter table employee_assets enable row level security;

create policy "employee_assets_hr_full" on employee_assets
  for all using (hrms_current_role() in ('admin','hr'));

create policy "employee_assets_manager_team_read" on employee_assets
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "employee_assets_self_read" on employee_assets
  for select using (employee_id = current_employee_id());

-- ---- Compensation history (a record per change, so payroll's live basic/
-- allowances on `employees` keeps working unmodified and this becomes the
-- audit trail of what it used to be) ----
create table employee_compensation_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  basic numeric(12,2) not null default 0,
  house_allowance numeric(12,2) not null default 0,
  transport_allowance numeric(12,2) not null default 0,
  other_allowance numeric(12,2) not null default 0,
  reason text,
  approved_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index idx_employee_comp_history_employee on employee_compensation_history(employee_id);
alter table employee_compensation_history enable row level security;

-- Sensitive: HR/admin only, plus the employee reading their own history —
-- deliberately no manager policy (matches Payroll tab's Manager row:
-- "Limited/No salary").
create policy "employee_comp_history_hr_full" on employee_compensation_history
  for all using (hrms_current_role() in ('admin','hr'));

create policy "employee_comp_history_self_read" on employee_compensation_history
  for select using (employee_id = current_employee_id());

-- ---- Job/department/manager movement history ----
create table employee_job_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  department text not null,
  job_title text not null,
  manager_id uuid references employees(id),
  employment_type employment_type not null,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_employee_job_history_employee on employee_job_history(employee_id);
alter table employee_job_history enable row level security;

create policy "employee_job_history_hr_full" on employee_job_history
  for all using (hrms_current_role() in ('admin','hr'));

create policy "employee_job_history_manager_team_read" on employee_job_history
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "employee_job_history_self_read" on employee_job_history
  for select using (employee_id = current_employee_id());

-- ---- Controlled HR/manager notes (never self-readable — the visibility
-- enum only has HR/Manager, on purpose) ----
create table employee_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  note_type text not null default 'General',
  note text not null,
  visibility employee_note_visibility not null default 'HR',
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index idx_employee_notes_employee on employee_notes(employee_id);
alter table employee_notes enable row level security;

create policy "employee_notes_hr_full" on employee_notes
  for all using (hrms_current_role() in ('admin','hr'));

create policy "employee_notes_manager_team" on employee_notes
  for select using (
    hrms_current_role() = 'manager' and visibility = 'Manager' and is_manager_of(employee_id)
  );

create policy "employee_notes_manager_insert" on employee_notes
  for insert with check (
    hrms_current_role() = 'manager' and visibility = 'Manager' and is_manager_of(employee_id)
  );
