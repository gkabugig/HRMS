-- Area 06 §11 "Check-ins": record structured manager check-ins and agreed
-- actions. Per schema inspection: no existing table covers this — appraisals
-- is the annual/cycle-based review record (manager_comments, final_score),
-- a materially different, heavier-weight artifact than an ad-hoc 1:1
-- check-in. Per §26 "add as little schema as possible... only after schema
-- inspection" this is the one genuinely missing piece for this workspace
-- section, so it gets its own small table rather than overloading
-- appraisals. Doubles as the "Feedback" deliverable (§11) — a feedback
-- entry is simply a check-in with no agreed_actions — rather than a third
-- table; "Recognition" is explicitly conditioned in the spec on "where the
-- product supports it" and is left out of this pass (no existing
-- kudos/recognition concept to build on, and it's the one Performance-
-- workspace bullet without a concrete acceptance test in §33).
create table if not exists manager_checkins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  manager_id uuid not null references employees(id),
  notes text not null,
  agreed_actions text,
  created_at timestamptz not null default now()
);
create index if not exists idx_manager_checkins_employee on manager_checkins(org_id, employee_id, created_at desc);
create index if not exists idx_manager_checkins_manager on manager_checkins(org_id, manager_id, created_at desc);

alter table manager_checkins enable row level security;

create policy "manager_checkins_hr_full" on manager_checkins
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "manager_checkins_self_read" on manager_checkins
  for select using (employee_id = current_employee_id());

create policy "manager_checkins_manager_insert" on manager_checkins
  for insert with check (
    hrms_current_role() = 'manager'
    and manager_id = current_employee_id()
    and is_manager_of(employee_id)
  );

create policy "manager_checkins_manager_read" on manager_checkins
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));
