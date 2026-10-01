-- Universal RBAC — wire real enforcement into the three highest-risk
-- resources (spec migration order steps 6-8: Employees, Employee
-- Documents, Payroll), without touching a single existing policy.
--
-- These are added as RESTRICTIVE policies, not permissive ones. Postgres
-- ANDs every RESTRICTIVE policy against the OR of all PERMISSIVE policies,
-- so a row must satisfy both the legacy role check *and* the new RBAC
-- resolver. That is exactly "do not remove existing RLS policies until the
-- new policies have been tested" (spec §10) implemented as a database
-- guarantee instead of a migration-order promise: the legacy policies stay
-- exactly as they are, and this layer can only ever narrow access further,
-- never widen it — so even a mistake in rbac_role_permissions data can't
-- accidentally expose something the old policies already blocked.
--
-- The seed in 0034 was written to mirror current effective access exactly,
-- so the intersection (old policy AND new policy) should equal the old
-- policy's result alone for every existing role. That was verified against
-- live data (see the migration commit notes) before this file shipped.

-- ---------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------

create policy "employees_select_rbac" on public.employees
  as restrictive
  for select to authenticated
  using (public.user_can_access_employee(id, 'view', 'normal'));

create policy "employees_update_rbac" on public.employees
  as restrictive
  for update to authenticated
  using (public.user_can_access_employee(id, 'edit', 'normal'))
  with check (public.user_can_access_employee(id, 'edit', 'normal'));

-- No existing row to resolve scope against yet, so insert/delete check
-- organisation-scope grants directly rather than through the record-level
-- resolver (create/delete have no meaningful self/direct_reports scope).
create policy "employees_insert_rbac" on public.employees
  as restrictive
  for insert to authenticated
  with check (
    org_id = current_org_id()
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('employees', 'create', 'normal') s))
  );

create policy "employees_delete_rbac" on public.employees
  as restrictive
  for delete to authenticated
  using (
    org_id = current_org_id()
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('employees', 'delete', 'normal') s))
  );

-- ---------------------------------------------------------------------
-- employee_documents
-- ---------------------------------------------------------------------

create policy "employee_documents_select_rbac" on public.employee_documents
  as restrictive
  for select to authenticated
  using (public.user_can_access_document(id, 'view', 'confidential'));

create policy "employee_documents_update_rbac" on public.employee_documents
  as restrictive
  for update to authenticated
  using (public.user_can_access_document(id, 'edit', 'confidential'))
  with check (
    exists (select 1 from public.employees e where e.id = employee_id and e.org_id = current_org_id())
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('documents', 'edit', 'confidential') s))
  );

create policy "employee_documents_insert_rbac" on public.employee_documents
  as restrictive
  for insert to authenticated
  with check (
    exists (select 1 from public.employees e where e.id = employee_id and e.org_id = current_org_id())
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('documents', 'edit', 'confidential') s))
  );

create policy "employee_documents_delete_rbac" on public.employee_documents
  as restrictive
  for delete to authenticated
  using (public.user_can_access_document(id, 'edit', 'confidential'));

-- ---------------------------------------------------------------------
-- payslips
-- ---------------------------------------------------------------------

create policy "payslips_select_rbac" on public.payslips
  as restrictive
  for select to authenticated
  using (public.user_can_access_payslip(id, 'view', 'normal'));

create policy "payslips_update_rbac" on public.payslips
  as restrictive
  for update to authenticated
  using (public.user_can_access_payslip(id, 'edit', 'highly_restricted'))
  with check (
    exists (select 1 from public.payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('payroll', 'edit', 'highly_restricted') s))
  );

-- calculatePayrollRun (lib/payroll/run-calculation.ts) deletes this run's
-- payslip rows and bulk-inserts fresh ones under the acting admin/hr
-- user's own session — not a service-role client — so these must allow
-- that bulk insert/delete or "Calculate" breaks for everyone.
create policy "payslips_insert_rbac" on public.payslips
  as restrictive
  for insert to authenticated
  with check (
    exists (select 1 from public.payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('payroll', 'edit', 'highly_restricted') s))
  );

create policy "payslips_delete_rbac" on public.payslips
  as restrictive
  for delete to authenticated
  using (
    exists (select 1 from public.payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('payroll', 'edit', 'highly_restricted') s))
  );
