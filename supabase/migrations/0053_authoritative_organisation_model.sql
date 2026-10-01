-- Area 04 — Authoritative Organisation Model: schema reconciliation.
--
-- Ground truth confirmed live before writing this (mirrors the Area 02/03
-- precedent of verifying the spec's assumptions against the real schema):
--   * organisation_units/locations/cost_centres/positions/employee_positions/
--     reporting_relationships already exist (0023_phase2_foundation.sql) and
--     employee_positions/reporting_relationships already carry
--     effective_from/effective_to/is_primary — the spec's "add if not
--     exists" for those three columns is therefore a no-op by design here.
--   * positions.headcount_approved already exists (reversed word order vs.
--     the spec's "approved_headcount") — renamed below rather than adding a
--     second column, since nothing besides src/lib/org-structure/actions.ts
--     and the organogram page reads it (both updated in this same commit).
--   * reporting_relationships.relationship_type does NOT exist — added.
--   * is_active/position_code do NOT exist anywhere — added.
--   * organisation_units.unit_type is a real enum (org_unit_type:
--     business_unit/department/team) — kept as the enum rather than widened
--     to text (adding enum values is a separate, non-transactional DDL step;
--     the spec's extra types — division/branch/project/other — are not
--     required for either live org's actual structure, so left out of this
--     pass rather than risking a half-applied ALTER TYPE).
--   * Both tenants currently have ZERO rows in all six organisation tables
--     (confirmed via count(*) before writing this) — see
--     0060_backfill_org_model_from_legacy_fields.sql.
--   * employees.department/reporting_manager_id are NOT deleted — kept as
--     compatibility fields per the spec's explicit instruction, and kept in
--     sync going forward by change_employee_assignment()
--     (0059_change_employee_assignment_fn.sql).

alter table public.organisation_units
  add column if not exists is_active boolean not null default true,
  add column if not exists effective_from date,
  add column if not exists effective_to date;

alter table public.locations
  add column if not exists is_active boolean not null default true;

alter table public.cost_centres
  add column if not exists is_active boolean not null default true;

alter table public.positions
  add column if not exists is_active boolean not null default true,
  add column if not exists position_code text,
  add column if not exists effective_from date,
  add column if not exists effective_to date;

-- headcount_approved -> approved_headcount (reconciling naming with the
-- spec; same column, same default, same not-null, no data loss).
alter table public.positions rename column headcount_approved to approved_headcount;

alter table public.reporting_relationships
  add column if not exists relationship_type text not null default 'line_manager';

alter table public.reporting_relationships
  add constraint reporting_relationships_type_check
  check (relationship_type in ('line_manager', 'dotted_line', 'functional_manager', 'project_manager'));

-- A unit cannot be its own direct parent (the cheap half of "cannot be its
-- own ancestor" — the transitive half is enforced by the trigger in
-- 0055_org_unit_cycle_guard_trigger.sql).
alter table public.organisation_units
  add constraint organisation_units_not_self_parent check (parent_id is distinct from id);

-- A reporting relationship cannot make someone their own manager.
alter table public.reporting_relationships
  add constraint reporting_relationships_not_self_managed check (employee_id is distinct from manager_id);

-- position_code is unique per org when set (not every position needs one).
create unique index if not exists idx_positions_org_code
  on public.positions (org_id, position_code)
  where position_code is not null;

-- At most one *currently open* primary position per employee — the DB-level
-- guard the research subagent flagged as missing (spec §27 "Multiple
-- primary positions").
create unique index if not exists idx_employee_positions_one_open_primary
  on public.employee_positions (employee_id)
  where is_primary and effective_to is null;

-- At most one currently open primary line-manager relationship per employee.
create unique index if not exists idx_reporting_rel_one_open_primary_manager
  on public.reporting_relationships (employee_id)
  where is_primary and relationship_type = 'line_manager' and effective_to is null;

-- Indexes (spec §5, reconciled to the column names that actually exist;
-- several of these already existed under different names from 0023 — added
-- here only where genuinely missing).
create index if not exists idx_employee_positions_employee_effective
  on public.employee_positions (employee_id, effective_from, effective_to);
create index if not exists idx_reporting_rel_employee_effective
  on public.reporting_relationships (employee_id, effective_from, effective_to);
create index if not exists idx_reporting_rel_manager
  on public.reporting_relationships (manager_id, effective_from, effective_to);
create index if not exists idx_reporting_rel_manager_plain
  on public.reporting_relationships (manager_id);
