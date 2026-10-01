-- Genuine pre-existing RLS gap found while live-testing Area 04's new
-- department/business_unit/team RBAC scopes: employees_select_rbac and
-- employees_update_rbac (migration 0035) were created as RESTRICTIVE
-- policies. A restrictive policy can only narrow access already granted by
-- a PERMISSIVE policy — it can never grant access on its own. The only
-- permissive SELECT/UPDATE policies on employees are self/direct_reports/
-- hr_full, so any role granted 'organisation', 'department', 'business_unit'
-- or 'team' scope through rbac_role_permissions has had NO working access
-- path at all since Area 01 shipped (the restrictive policy correctly
-- computes "allowed", but there is no permissive policy to pair it with for
-- anyone outside self/direct-reports/hr). This predates Area 04 and is not
-- something this pass introduced, but implementing real department/
-- business_unit/team hierarchy resolution is what first exercised it in
-- live testing (confirmed via rolled-back RLS-impersonation tests: a
-- department-scoped viewer saw 0 rows for a teammate even though
-- user_can_access_employee() computed true for that exact row).
--
-- Fixed additively rather than by dropping the restrictive policies (DROP
-- POLICY requires an interactive confirmation this environment could not
-- satisfy non-interactively): a new PERMISSIVE policy with the exact same
-- predicate is OR'd in alongside the existing self/manager/hr permissive
-- policies, so a row user_can_access_employee() already approves is no
-- longer vetoed by having no permissive policy at all. This cannot widen
-- access beyond what the restrictive policy (the same function) already
-- independently requires — verified live: a department-scoped fixture user
-- could read teammates in the same authoritative unit and nothing outside
-- it, both before and after this fix, modulo the previously-blocked case.
--
-- The same restrictive/no-permissive-companion pattern likely exists on
-- other RBAC-gated tables (documents, payslips) — out of scope for this
-- pass since nothing here exercises them; flagged for a future look.
create policy "employees_rbac_scope_select" on public.employees
  for select to authenticated
  using (user_can_access_employee(id, org_id, department, 'view'::rbac_action, 'normal'::rbac_sensitivity));

create policy "employees_rbac_scope_update" on public.employees
  for update to authenticated
  using (user_can_access_employee(id, org_id, department, 'edit'::rbac_action, 'normal'::rbac_sensitivity))
  with check (user_can_access_employee(id, org_id, department, 'edit'::rbac_action, 'normal'::rbac_sensitivity));
