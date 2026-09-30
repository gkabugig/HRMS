-- General task/asset assignment tracking (broader than the offboarding-only
-- asset checklist that already exists).

create type assignment_type as enum ('Task','Asset');
create type assignment_status as enum ('Open','In Progress','Completed');

create table assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  type assignment_type not null default 'Task',
  title text not null,
  description text,
  due_date date,
  status assignment_status not null default 'Open',
  assigned_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table assignments enable row level security;

create policy "assignments_hr_full" on assignments
  for all using (hrms_current_role() in ('admin','hr'));

create policy "assignments_manager_team" on assignments
  for all using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "assignments_self_read" on assignments
  for select using (employee_id = current_employee_id());

-- Employees can update the status of their own assignments (e.g. mark a
-- task done, confirm an asset received) but not reassign, retitle, or
-- delete — those stay HR/admin/manager-only via the policies above.
create policy "assignments_self_update_status" on assignments
  for update using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id());
