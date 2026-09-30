-- Kenya Employment Act, 2007 compliance additions (see the HRMS compliance
-- review doc). Additive columns + one new table; no destructive changes.

-- ---- Section 42: probation tracking ----
alter table employees add column probation_end_date date;

-- ---- Section 9/10: written particulars of employment ----
alter table employees add column contract_issued_on date;

-- ---- Section 40: redundancy severance pay + notice/selection records ----
alter table offboarding_records add column severance_pay numeric(12,2) not null default 0;
alter table offboarding_records add column labour_office_notified_on date;
alter table offboarding_records add column union_notified_on date;
alter table offboarding_records add column selection_criteria text;

-- ---- Section 35: notice period / payment in lieu ----
alter table offboarding_records add column paid_in_lieu_of_notice boolean not null default false;

-- ---- Section 41: notification and hearing before termination ----
create table disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  reason text not null,
  hearing_date date not null,
  representative_present boolean not null default false,
  representative_name text,
  employee_response text,
  outcome text,
  action_type text not null default 'Written warning',
  offboarding_id uuid references offboarding_records(id),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

alter table disciplinary_actions enable row level security;

create policy "disciplinary_hr_full" on disciplinary_actions
  for all using (hrms_current_role() in ('admin','hr'));

create policy "disciplinary_manager_team_read" on disciplinary_actions
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "disciplinary_manager_insert" on disciplinary_actions
  for insert with check (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "disciplinary_self_read" on disciplinary_actions
  for select using (employee_id = current_employee_id());
