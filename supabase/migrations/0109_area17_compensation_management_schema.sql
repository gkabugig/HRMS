-- Area 17 §8: Compensation Management. employee_compensation_history is
-- ALREADY the authoritative, effective-dated employee pay record that
-- payroll_runs/payroll_outputs read from (spec's own "complements rather
-- than duplicates external payroll execution" — §8.1); this migration
-- extends it with a grade/plan link rather than creating a competing
-- "employee_compensation" table. Historical rows stay immutable by
-- convention (new row + effective_to close-out), enforced in the service
-- layer since RLS here is read/write-by-role, not row-level append-only.

alter table employee_compensation_history
  add column if not exists grade_id uuid,
  add column if not exists compensation_plan_id uuid,
  add column if not exists change_request_id uuid;

create table compensation_grades (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  description text,
  order_rank integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

alter table employee_compensation_history
  add constraint employee_compensation_history_grade_id_fkey foreign key (grade_id) references compensation_grades(id);

-- Effective salary ranges per grade. Not partial-unique (migration-tool
-- constraint from Areas 10/11: predicates on now()/date ranges break either
-- IMMUTABLE rules or PostgREST upsert targeting) — overlap prevention is a
-- service-layer check, not a DB constraint, same trade-off already made
-- for workforce_risk_suppressions.
create table compensation_bands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  grade_id uuid not null references compensation_grades(id),
  currency text not null default 'KES',
  min_amount numeric(14,2) not null,
  max_amount numeric(14,2) not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (max_amount >= min_amount)
);

-- Reference catalogue of pay elements. employee_compensation_history keeps
-- its existing fixed columns (basic/house_allowance/transport_allowance/
-- other_allowance) so the live payroll pipeline is untouched; this table
-- documents what those (and any future) elements mean and whether they're
-- taxable, for compensation_plans and review/reporting to reference.
create table compensation_components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  component_type text not null check (component_type in ('basic','allowance','benefit','deduction')),
  is_taxable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

-- Package definitions: a default basic/allowance split for a grade, used as
-- a starting point for change requests rather than a binding structure.
create table compensation_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  description text,
  grade_id uuid references compensation_grades(id),
  default_basic numeric(14,2),
  default_house_allowance numeric(14,2),
  default_transport_allowance numeric(14,2),
  default_other_allowance numeric(14,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table employee_compensation_history
  add constraint employee_compensation_history_compensation_plan_id_fkey foreign key (compensation_plan_id) references compensation_plans(id);

-- §8.3 lifecycle: draft->submitted->approved->scheduled->effective->superseded,
-- alternatives rejected/cancelled. Routed through Area 02's approval engine
-- like Area 16's position_requests. Applying an approved request INSERTS a
-- new employee_compensation_history row (closing the prior one's
-- effective_to) rather than ever updating historical amounts in place.
create table compensation_change_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  requested_by uuid not null references app_users(id),
  status text not null default 'draft' check (status in ('draft','submitted','approved','scheduled','effective','superseded','rejected','cancelled')),
  proposed_grade_id uuid references compensation_grades(id),
  proposed_basic numeric(14,2),
  proposed_house_allowance numeric(14,2),
  proposed_transport_allowance numeric(14,2),
  proposed_other_allowance numeric(14,2),
  effective_from date not null,
  reason text not null,
  is_outside_band boolean not null default false,
  approval_request_id uuid references approval_requests(id),
  review_item_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  applied_at timestamptz
);

create table compensation_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  change_request_id uuid not null references compensation_change_requests(id),
  reason text not null,
  authorised_by uuid references app_users(id),
  authorised_at timestamptz not null default now(),
  expiry_date date,
  created_at timestamptz not null default now()
);

create table compensation_review_cycles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','open','calibration','approved','closed')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table compensation_review_items (
  id uuid primary key default gen_random_uuid(),
  review_cycle_id uuid not null references compensation_review_cycles(id) on delete cascade,
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  manager_recommendation_pct numeric(6,2),
  manager_comment text,
  hr_decision_pct numeric(6,2),
  hr_comment text,
  status text not null default 'pending' check (status in ('pending','recommended','calibrated','approved','rejected')),
  change_request_id uuid references compensation_change_requests(id),
  created_at timestamptz not null default now(),
  unique (review_cycle_id, employee_id)
);

alter table compensation_change_requests
  add constraint compensation_change_requests_review_item_id_fkey foreign key (review_item_id) references compensation_review_items(id);

create table compensation_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  actor_user_id uuid references app_users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Distinct from payroll_outputs (Area 15's payroll-run output artifacts):
-- this is Area 17's handoff of approved, effective-dated compensation
-- CHANGES to external payroll for a period, not a payroll run itself.
create table payroll_export_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  period text not null,
  status text not null default 'generated' check (status in ('generated','sent','confirmed')),
  row_count integer not null default 0,
  checksum text,
  notes text,
  exported_by uuid references app_users(id),
  exported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table compensation_budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  organisation_unit_id uuid,
  budget_period_start date not null,
  budget_period_end date not null,
  budgeted_amount numeric(14,2) not null,
  currency text not null default 'KES',
  created_at timestamptz not null default now()
);

create index compensation_bands_grade_id_idx on compensation_bands(grade_id);
create index compensation_change_requests_employee_id_idx on compensation_change_requests(employee_id);
create index compensation_change_requests_org_status_idx on compensation_change_requests(org_id, status);
create index compensation_review_items_review_cycle_id_idx on compensation_review_items(review_cycle_id);
create index compensation_review_items_employee_id_idx on compensation_review_items(employee_id);
create index compensation_events_entity_idx on compensation_events(entity_type, entity_id);
create index compensation_budgets_org_id_idx on compensation_budgets(org_id);
create index employee_compensation_history_grade_id_idx on employee_compensation_history(grade_id);
create index employee_compensation_history_compensation_plan_id_idx on employee_compensation_history(compensation_plan_id);

alter table compensation_grades enable row level security;
alter table compensation_bands enable row level security;
alter table compensation_components enable row level security;
alter table compensation_plans enable row level security;
alter table compensation_change_requests enable row level security;
alter table compensation_exceptions enable row level security;
alter table compensation_review_cycles enable row level security;
alter table compensation_review_items enable row level security;
alter table compensation_events enable row level security;
alter table payroll_export_batches enable row level security;
alter table compensation_budgets enable row level security;

-- Reference data (grades/bands/components/plans): org-wide read so Area 10
-- cost analytics and employee-facing "my grade" views can resolve names;
-- write restricted to hr/admin. Everything else here is compensation DATA
-- (amounts, recommendations, exceptions, budgets) and per spec §8.5 is
-- stricter than ordinary profile data: hr/admin only, no self-read.
create policy compensation_grades_org_read on compensation_grades for select using (org_id = current_org_id());
create policy compensation_grades_hr_write on compensation_grades for insert with check (hrms_current_role() in ('admin','hr'));
create policy compensation_grades_hr_update on compensation_grades for update using (hrms_current_role() in ('admin','hr'));

create policy compensation_bands_org_read on compensation_bands for select using (org_id = current_org_id());
create policy compensation_bands_hr_write on compensation_bands for insert with check (hrms_current_role() in ('admin','hr'));
create policy compensation_bands_hr_update on compensation_bands for update using (hrms_current_role() in ('admin','hr'));

create policy compensation_components_org_read on compensation_components for select using (org_id = current_org_id());
create policy compensation_components_hr_write on compensation_components for insert with check (hrms_current_role() in ('admin','hr'));
create policy compensation_components_hr_update on compensation_components for update using (hrms_current_role() in ('admin','hr'));

create policy compensation_plans_org_read on compensation_plans for select using (org_id = current_org_id());
create policy compensation_plans_hr_write on compensation_plans for insert with check (hrms_current_role() in ('admin','hr'));
create policy compensation_plans_hr_update on compensation_plans for update using (hrms_current_role() in ('admin','hr'));

create policy compensation_change_requests_hr_all on compensation_change_requests for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy compensation_change_requests_manager_create on compensation_change_requests for insert
  with check (org_id = current_org_id() and is_manager_of(employee_id));
create policy compensation_change_requests_manager_read on compensation_change_requests for select
  using (is_manager_of(employee_id));

create policy compensation_exceptions_hr_all on compensation_exceptions for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy compensation_review_cycles_hr_all on compensation_review_cycles for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy compensation_review_items_hr_all on compensation_review_items for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy compensation_review_items_manager_read on compensation_review_items for select
  using (is_manager_of(employee_id));
create policy compensation_review_items_manager_recommend on compensation_review_items for update
  using (is_manager_of(employee_id) and status = 'pending')
  with check (is_manager_of(employee_id));

create policy compensation_events_hr_all on compensation_events for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy payroll_export_batches_hr_all on payroll_export_batches for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy compensation_budgets_hr_all on compensation_budgets for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
