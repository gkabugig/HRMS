-- Payroll Command Centre (see HRMS_Payroll_Command_Centre_Build_Specification.docx).
-- Per the spec's own §31 "Developer Notes": reuse payroll_runs and payslips
-- as the period anchor and result records rather than duplicating them;
-- only add what the existing schema genuinely doesn't provide — a state
-- machine on payroll_runs, an exception/approval/adjustment/output trail,
-- a payroll-scoped audit log, and the employee bank fields the spec's
-- "missing bank details" exception and Bank/Payment File Centre need
-- (none existed anywhere in the schema before this).

-- ---- Workflow state on the existing period anchor ----
-- Existing rows already have real payslips generated, i.e. they are, in
-- truth, done deals — backfilled below to 'paid'/locked rather than
-- guessed into 'draft', so historical payroll isn't silently reopened.
-- New runs created from here on start at 'draft' via the app (the column
-- default is 'calculated' only as a safety net for any other insert path).
alter table payroll_runs add column status text not null default 'calculated'
  check (status in ('draft','inputs_open','calculated','under_review','approved','processed','paid','closed'));
alter table payroll_runs add column locked boolean not null default false;
update payroll_runs set status = 'paid', locked = true;

-- ---- Bank details (spec §6 input checklist, §7 exceptions, §19 bank file) ----
alter table employees add column bank_name text;
alter table employees add column bank_account_no text;
alter table employees add column bank_branch_code text;

-- ---- Per-org configurable exception threshold (spec §7: "do not hard-code
-- a universal 10%/KES threshold without an organisation setting") ----
alter table organizations add column payroll_variance_warning_pct numeric(5,2) not null default 15;

-- ---- Publish gating for the Payslip Centre (spec §18: "publish to
-- employee self-service only after payroll reaches appropriate state").
-- Existing payslips are backfilled as already published (see above — their
-- run is now 'paid') so no employee loses access to a payslip they could
-- already see; payslips created by new runs stay unpublished until an
-- explicit publish action. ----
alter table payslips add column published_at timestamptz;
update payslips set published_at = now();

drop policy "payslips_self_read" on payslips;
create policy "payslips_self_read" on payslips
  for select using (employee_id = current_employee_id() and published_at is not null);

-- ============ EXCEPTION / APPROVAL / ADJUSTMENT / OUTPUT / AUDIT ============

create table payroll_exceptions (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid references employees(id),
  exception_type text not null,
  severity text not null check (severity in ('critical','warning','info')),
  message text not null,
  status text not null default 'open'
    check (status in ('open','resolved','waived')),
  source text not null default 'auto' check (source in ('auto','manual')),
  resolved_by uuid references app_users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index idx_payroll_exceptions_run on payroll_exceptions(payroll_run_id);
create index idx_payroll_exceptions_employee on payroll_exceptions(employee_id);
alter table payroll_exceptions enable row level security;

create policy "payroll_exceptions_hr_full" on payroll_exceptions
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
  );

create table payroll_approvals (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  stage text not null,
  approver_id uuid not null references app_users(id),
  decision text not null check (decision in ('approved','rejected','returned')),
  comment text,
  decided_at timestamptz not null default now()
);

create index idx_payroll_approvals_run on payroll_approvals(payroll_run_id);
alter table payroll_approvals enable row level security;

create policy "payroll_approvals_hr_full" on payroll_approvals
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
  );

create table payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id),
  adjustment_type text not null,
  amount numeric(14,2) not null,
  reason text not null,
  approved_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index idx_payroll_adjustments_run on payroll_adjustments(payroll_run_id);
alter table payroll_adjustments enable row level security;

create policy "payroll_adjustments_hr_full" on payroll_adjustments
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
  );

create table payroll_outputs (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  output_type text not null,
  row_count int not null default 0,
  checksum text not null,
  generated_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index idx_payroll_outputs_run on payroll_outputs(payroll_run_id);
alter table payroll_outputs enable row level security;

create policy "payroll_outputs_hr_full" on payroll_outputs
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
  );

-- Payroll-scoped audit trail (spec §20). Deliberately separate from
-- employee_audit_log, which tracks field-level employee-record edits, not
-- payroll workflow events.
create table payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  payroll_run_id uuid references payroll_runs(id) on delete cascade,
  actor_id uuid references app_users(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  old_value_json jsonb,
  new_value_json jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_payroll_audit_log_run on payroll_audit_log(payroll_run_id);
create index idx_payroll_audit_log_org on payroll_audit_log(org_id);
alter table payroll_audit_log enable row level security;

create policy "payroll_audit_log_hr_read" on payroll_audit_log
  for select using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- Inserts happen through server actions using the signed-in user's own
-- session (not a service role), so an insert policy is required too —
-- every payroll-changing action always runs as admin/hr already (enforced
-- by the other tables' policies above), so this mirrors that.
create policy "payroll_audit_log_hr_insert" on payroll_audit_log
  for insert with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
