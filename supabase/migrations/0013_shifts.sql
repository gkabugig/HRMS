-- Working schedule / shift builder. One active shift per employee (simple
-- model — no shift history). Attendance lateness moves from the single
-- hardcoded 8am/15min-grace constant to whatever shift the employee is on,
-- falling back to that same default when unassigned.

create table shift_patterns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  start_time time not null,
  end_time time not null,
  grace_minutes int not null default 15,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table employee_shifts (
  employee_id uuid primary key references employees(id),
  shift_pattern_id uuid not null references shift_patterns(id),
  assigned_on date not null default current_date
);

alter table shift_patterns enable row level security;
alter table employee_shifts enable row level security;

create policy "shift_patterns_hr_full" on shift_patterns
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "shift_patterns_read_all" on shift_patterns
  for select using (org_id = current_org_id());

create policy "employee_shifts_hr_full" on employee_shifts
  for all using (hrms_current_role() in ('admin','hr'));

create policy "employee_shifts_manager_read" on employee_shifts
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "employee_shifts_self_read" on employee_shifts
  for select using (employee_id = current_employee_id());
