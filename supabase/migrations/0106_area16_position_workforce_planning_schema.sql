-- Area 16 §7: Position & Workforce Planning.
-- positions/organisation_units/cost_centres/locations/reporting_relationships
-- already exist (Phase 2) and are extended here, not duplicated. "status" on
-- positions keeps its existing vacant/occupied occupancy meaning untouched;
-- the new "lifecycle_status" column is a separate, additive concept per
-- spec §7.3 (draft->submitted->approved->active->frozen/closed).

alter table positions
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists position_type_id uuid;

alter table positions
  add constraint positions_lifecycle_status_check
    check (lifecycle_status in ('draft','submitted','approved','active','frozen','closed'));

-- Confirmed via live query: no duplicate (org_id, position_code) pairs exist
-- today, so this is safe to add directly. Plain (non-partial) constraint:
-- standard SQL unique semantics already allow unlimited NULLs, which is what
-- we want for positions that have no code yet.
alter table positions
  add constraint positions_org_code_unique unique (org_id, position_code);

create table position_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

alter table positions
  add constraint positions_position_type_id_fkey
    foreign key (position_type_id) references position_types(id);

-- §7.6 effective-dated history: one row per committed change to a position.
create table position_versions (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id),
  org_id uuid not null references organizations(id),
  version_no integer not null,
  title text not null,
  organisation_unit_id uuid,
  location_id uuid,
  cost_centre_id uuid,
  reports_to_position_id uuid,
  position_type_id uuid,
  approved_headcount integer not null,
  lifecycle_status text not null,
  effective_from date not null,
  effective_to date,
  changed_by uuid references app_users(id),
  change_reason text,
  created_at timestamptz not null default now(),
  unique (position_id, version_no)
);

-- §7.7: create/change/freeze/unfreeze/close requests, routed through Area
-- 02's existing approval engine rather than a new one.
create table position_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  position_id uuid references positions(id),
  request_type text not null check (request_type in ('create','change','freeze','unfreeze','close')),
  requested_by uuid not null references app_users(id),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','withdrawn')),
  payload_json jsonb not null default '{}'::jsonb,
  justification text,
  approval_request_id uuid references approval_requests(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table workforce_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  planning_period_start date not null,
  planning_period_end date not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','active','closed')),
  owner_user_id uuid references app_users(id),
  approval_request_id uuid references approval_requests(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table workforce_plan_lines (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references workforce_plans(id) on delete cascade,
  org_id uuid not null references organizations(id),
  organisation_unit_id uuid,
  position_type_id uuid references position_types(id),
  grade text,
  planned_headcount integer not null default 0,
  planned_cost numeric(14,2),
  notes text,
  created_at timestamptz not null default now()
);

-- §7.8: genuinely new concept, distinct from positions.status='vacant' —
-- tracks the recruitment-demand lifecycle, not occupancy. Once this exists,
-- Area 11's currently-deferred POS-VAC-001 rule can read opened_at from here.
create table vacancies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  position_id uuid not null references positions(id),
  requisition_id uuid references requisitions(id),
  status text not null default 'open' check (status in ('open','on_hold','filled','cancelled')),
  opened_at timestamptz not null default now(),
  target_fill_date date,
  filled_at timestamptz,
  filled_by_employee_id uuid references employees(id),
  cancelled_reason text,
  created_at timestamptz not null default now()
);

create table position_budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  position_id uuid not null references positions(id),
  budget_period_start date not null,
  budget_period_end date not null,
  budgeted_amount numeric(14,2) not null,
  currency text not null default 'KES',
  cost_centre_id uuid references cost_centres(id),
  created_at timestamptz not null default now()
);

create table workforce_scenarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  description text,
  base_plan_id uuid references workforce_plans(id),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table workforce_scenario_lines (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references workforce_scenarios(id) on delete cascade,
  org_id uuid not null references organizations(id),
  organisation_unit_id uuid,
  position_type_id uuid references position_types(id),
  grade text,
  headcount_delta integer not null default 0,
  cost_delta numeric(14,2),
  notes text,
  created_at timestamptz not null default now()
);

-- Lifecycle audit trail, mirroring workforce_risk_events' pattern.
create table position_events (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id),
  org_id uuid not null references organizations(id),
  event_type text not null,
  actor_user_id uuid references app_users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index position_versions_position_id_idx on position_versions(position_id);
create index position_requests_position_id_idx on position_requests(position_id);
create index position_requests_org_status_idx on position_requests(org_id, status);
create index workforce_plan_lines_plan_id_idx on workforce_plan_lines(plan_id);
create index vacancies_position_id_idx on vacancies(position_id);
create index vacancies_org_status_idx on vacancies(org_id, status);
create index position_budgets_position_id_idx on position_budgets(position_id);
create index workforce_scenario_lines_scenario_id_idx on workforce_scenario_lines(scenario_id);
create index position_events_position_id_idx on position_events(position_id);

alter table position_types enable row level security;
alter table position_versions enable row level security;
alter table position_requests enable row level security;
alter table workforce_plans enable row level security;
alter table workforce_plan_lines enable row level security;
alter table vacancies enable row level security;
alter table position_budgets enable row level security;
alter table workforce_scenarios enable row level security;
alter table workforce_scenario_lines enable row level security;
alter table position_events enable row level security;

create policy position_types_org_read on position_types for select
  using (org_id = current_org_id());
create policy position_types_hr_write on position_types for insert with check (hrms_current_role() in ('admin','hr'));
create policy position_types_hr_update on position_types for update using (hrms_current_role() in ('admin','hr'));
create policy position_types_hr_delete on position_types for delete using (hrms_current_role() in ('admin','hr'));

create policy position_versions_hr_all on position_versions for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy position_versions_org_read on position_versions for select using (org_id = current_org_id());

create policy position_requests_hr_all on position_requests for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy position_requests_requester_read on position_requests for select
  using (requested_by = current_employee_id() or requested_by = (select id from app_users where id = auth.uid()));
create policy position_requests_requester_create on position_requests for insert
  with check (org_id = current_org_id());

create policy workforce_plans_hr_all on workforce_plans for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy workforce_plan_lines_hr_all on workforce_plan_lines for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy vacancies_hr_all on vacancies for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy vacancies_org_read on vacancies for select using (org_id = current_org_id());

create policy position_budgets_hr_all on position_budgets for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy workforce_scenarios_hr_all on workforce_scenarios for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy workforce_scenario_lines_hr_all on workforce_scenario_lines for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy position_events_hr_all on position_events for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy position_events_org_read on position_events for select using (org_id = current_org_id());
