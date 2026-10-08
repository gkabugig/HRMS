-- Personal checklist (each person's own to-dos, HR can assign one) and wellbeing
-- (a private weekly check-in and a list of support resources HR maintains).

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  title text not null check (length(trim(title)) > 0),
  due_date date,
  done_at timestamptz,
  assigned_by uuid references app_users(id),   -- null = added by the person themselves
  created_at timestamptz not null default now()
);
create index checklist_items_emp_idx on checklist_items(employee_id, done_at);

create table wellbeing_checkins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  week_start date not null,
  mood int not null check (mood between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  unique (employee_id, week_start),
  check (extract(isodow from week_start) = 1)
);

create table wellbeing_resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  title text not null check (length(trim(title)) > 0),
  body text,
  url text,
  created_at timestamptz not null default now()
);

alter table checklist_items enable row level security;
alter table wellbeing_checkins enable row level security;
alter table wellbeing_resources enable row level security;

create policy checklist_self on checklist_items for all
  using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id() and org_id = current_org_id() and assigned_by is null);
create policy checklist_hr on checklist_items for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- Check-ins are private to the person. HR sees only combined figures, produced by the server.
create policy wellbeing_checkins_self on wellbeing_checkins for all
  using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id() and org_id = current_org_id());

create policy wellbeing_resources_read on wellbeing_resources for select using (org_id = current_org_id());
create policy wellbeing_resources_hr on wellbeing_resources for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
