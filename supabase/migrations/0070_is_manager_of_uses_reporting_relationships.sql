-- Area 06 Manager Workspace — pre-build fix.
--
-- is_manager_of() (0002_rls.sql) is the function nearly every manager-facing
-- RLS policy in the app is keyed on (attendance, leave_requests, employees,
-- employee_documents, appraisals, training_enrollments, etc.). As shipped it
-- reads ONLY employees.reporting_manager_id — the field Area 04's own code
-- comments call legacy/superseded once reporting_relationships (effective-
-- dated, supports future org moves without rewriting history) became
-- authoritative. Confirmed via live data: today the two agree for all 6
-- employees, so this is not an active bug, but Area 06 is about to build a
-- NEW direct-reports resolver (get-direct-reports.ts) against
-- reporting_relationships for the workspace's own scope decisions — if RLS
-- kept gating on the legacy field while the workspace resolver used the
-- authoritative one, the two would silently diverge the first time a
-- manager reassignment happens through Area 04 (an org move with an
-- effective_from date) rather than a direct write to
-- employees.reporting_manager_id. Per spec §18: "Never infer reporting
-- authority from legacy employees.reporting_manager_id once Area 04 becomes
-- authoritative" and "use effective-dated relationships so historical
-- reports do not unexpectedly change when a manager moves."
--
-- Fix: widen is_manager_of() to recognize EITHER the legacy field OR a
-- currently-effective primary reporting_relationships row, via
-- create-or-replace (no drop needed — this is a pure behavior widening, not
-- a schema change, and every existing call site is unaffected in shape).
-- This does not remove the legacy-field check (several employees rows may
-- still only have the legacy field populated for older records that
-- predate Area 04 roll-out), it only adds the authoritative source as a
-- second, equally valid way to establish the relationship.
-- relationship_type = 'line_manager' filter matches get_current_manager_id's
-- own filter (migration 0056) — reporting_relationships can hold other
-- relationship types (e.g. dotted-line/functional), which should not by
-- themselves confer full manager RLS authority over the employee's record.
create or replace function is_manager_of(target_employee_id uuid) returns boolean as $$
  select exists (
    select 1 from employees
    where id = target_employee_id
      and reporting_manager_id = current_employee_id()
  )
  or exists (
    select 1 from reporting_relationships
    where employee_id = target_employee_id
      and manager_id = current_employee_id()
      and relationship_type = 'line_manager'
      and is_primary = true
      and effective_from <= current_date
      and (effective_to is null or effective_to >= current_date)
  );
$$ language sql stable security definer set search_path = public;
