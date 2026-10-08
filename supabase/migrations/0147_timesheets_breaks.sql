-- Weekly timesheets (submitted through the shared approval engine) and
-- lunch/tea break tracking against the day's clock-in.

create table timesheets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  week_start date not null check (extract(isodow from week_start) = 1),   -- always a Monday
  status text not null default 'Draft' check (status in ('Draft','Submitted','Approved','Rejected')),
  total_hours numeric(6,2) not null default 0,
  submitted_at timestamptz,
  decided_at timestamptz,
  approval_request_id uuid references approval_requests(id),
  created_at timestamptz not null default now(),
  unique (employee_id, week_start)
);
create index timesheets_org_idx on timesheets(org_id, week_start desc);

create table timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references timesheets(id) on delete cascade,
  work_date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  project text,
  note text,
  created_at timestamptz not null default now()
);
create index timesheet_entries_ts_idx on timesheet_entries(timesheet_id, work_date);

create table attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  work_date date not null,
  kind text not null default 'lunch' check (kind in ('lunch','tea','other')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index attendance_breaks_emp_idx on attendance_breaks(employee_id, work_date);
-- One open break at a time per person.
create unique index attendance_breaks_one_open on attendance_breaks(employee_id) where ended_at is null;

alter table timesheets enable row level security;
alter table timesheet_entries enable row level security;
alter table attendance_breaks enable row level security;

create policy timesheets_hr on timesheets for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy timesheets_self_read on timesheets for select using (employee_id = current_employee_id());
-- An employee can start their own week and edit it while it is a draft or was sent back.
-- Submitting and approving are done by the server, never by the browser.
create policy timesheets_self_insert on timesheets for insert
  with check (employee_id = current_employee_id() and org_id = current_org_id() and status = 'Draft');
create policy timesheets_self_update on timesheets for update
  using (employee_id = current_employee_id() and status in ('Draft','Rejected'))
  with check (employee_id = current_employee_id() and status in ('Draft','Rejected'));
create policy timesheets_manager_read on timesheets for select
  using (exists (select 1 from employees e where e.id = timesheets.employee_id and e.reporting_manager_id = current_employee_id()));

create policy timesheet_entries_hr on timesheet_entries for all
  using (hrms_current_role() in ('admin','hr') and exists (select 1 from timesheets t where t.id = timesheet_entries.timesheet_id and t.org_id = current_org_id()))
  with check (hrms_current_role() in ('admin','hr') and exists (select 1 from timesheets t where t.id = timesheet_entries.timesheet_id and t.org_id = current_org_id()));
create policy timesheet_entries_self on timesheet_entries for all
  using (exists (select 1 from timesheets t where t.id = timesheet_entries.timesheet_id and t.employee_id = current_employee_id() and t.status in ('Draft','Rejected')))
  with check (exists (select 1 from timesheets t where t.id = timesheet_entries.timesheet_id and t.employee_id = current_employee_id() and t.status in ('Draft','Rejected')));
create policy timesheet_entries_self_read on timesheet_entries for select
  using (exists (select 1 from timesheets t where t.id = timesheet_entries.timesheet_id and t.employee_id = current_employee_id()));
create policy timesheet_entries_manager_read on timesheet_entries for select
  using (exists (select 1 from timesheets t join employees e on e.id = t.employee_id where t.id = timesheet_entries.timesheet_id and e.reporting_manager_id = current_employee_id()));

create policy attendance_breaks_hr on attendance_breaks for select
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy attendance_breaks_self on attendance_breaks for select using (employee_id = current_employee_id());
create policy attendance_breaks_manager on attendance_breaks for select
  using (exists (select 1 from employees e where e.id = attendance_breaks.employee_id and e.reporting_manager_id = current_employee_id()));
