-- Universal RBAC — fix a Postgres RLS self-reference bug found while
-- verifying migration 0036 against live data.
--
-- Postgres evaluates a table's SELECT RLS policy against the resulting
-- row(s) of INSERT/UPDATE ... RETURNING (which is exactly what
-- supabase-js generates whenever .select() is chained after
-- .insert()/.update()). The three record-level resolver functions added
-- in 0035 (user_can_access_employee/_document/_payslip) each took just a
-- row id and then re-queried their OWN protected table by that id to
-- fetch the row's org/department/employee columns. Under that specific
-- RETURNING-evaluation context, the self-query does not reliably see the
-- row, so the resolver silently returns false and the write is rejected
-- with "new row violates row-level security policy" — confirmed live:
--   insert into payslips (...) ... returning id
-- failed this way as the real admin user, who passes every other check.
--
-- This breaks two real, previously-working code paths once 0036 ships:
--   - createEmployee (src/app/dashboard/employees/actions.ts),
--     .insert(payload).select("id").single()
--   - publishPayslips (src/app/dashboard/payroll/[payrollRunId]/actions.ts),
--     .update(...).select("id")
--
-- Fix: the resolvers never query their own protected table again. Instead
-- they take the row's relevant columns as parameters, bound from column
-- references in the calling RLS policy itself (free — no subquery, the
-- planner already has the row). Where a resolver still needs to look
-- something up, it only ever queries a *different* table:
--   - user_can_access_employee: org_id/department passed in directly.
--   - user_can_access_document: takes employee_id directly (a column on
--     employee_documents) and queries employees — a different table — for
--     that employee's org_id/department.
--   - user_can_access_payslip: takes employee_id/payroll_run_id directly
--     (columns on payslips) and queries payroll_runs — a different
--     table — for the run's org_id.
--
-- authorize_request() is a standalone RPC, not an RLS policy evaluated
-- against a RETURNING row, so it is not subject to this bug; it now
-- resolves a record's columns itself (one lookup against the relevant
-- table, not the row under RETURNING) before calling the resolvers.

-- ---------------------------------------------------------------------
-- 1. Drop the policies that call the resolver functions, so the
--    functions can be dropped and recreated with new signatures.
-- ---------------------------------------------------------------------

drop policy if exists "employees_select_rbac" on public.employees;
drop policy if exists "employees_update_rbac" on public.employees;
drop policy if exists "employee_documents_select_rbac" on public.employee_documents;
drop policy if exists "employee_documents_update_rbac" on public.employee_documents;
drop policy if exists "employee_documents_delete_rbac" on public.employee_documents;
drop policy if exists "payslips_select_rbac" on public.payslips;
drop policy if exists "payslips_update_rbac" on public.payslips;

drop function if exists public.user_can_access_employee(uuid, public.rbac_action, public.rbac_sensitivity);
drop function if exists public.user_can_access_document(uuid, public.rbac_action, public.rbac_sensitivity);
drop function if exists public.user_can_access_payslip(uuid, public.rbac_action, public.rbac_sensitivity);

-- ---------------------------------------------------------------------
-- 2. Recreate the resolvers, no self-query of their own protected table.
-- ---------------------------------------------------------------------

create or replace function public.user_can_access_employee(
  p_employee_id uuid,
  p_org_id uuid,
  p_department text,
  p_action public.rbac_action,
  p_sensitivity public.rbac_sensitivity default 'normal'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_self_employee uuid := public.current_employee_id();
  v_own_department text;
  v_scopes public.rbac_scope[];
begin
  if v_org is null or p_org_id is null or p_org_id <> v_org then
    return false;
  end if;

  select array_agg(s) into v_scopes from public.rbac_granted_scopes('employees', p_action, p_sensitivity) s;
  if v_scopes is null then
    return false;
  end if;

  if 'organisation' = any (v_scopes) then
    return true;
  end if;

  if 'self' = any (v_scopes) and v_self_employee is not null and v_self_employee = p_employee_id then
    return true;
  end if;

  if 'direct_reports' = any (v_scopes) and public.is_manager_of(p_employee_id) then
    return true;
  end if;

  -- department scope is not granted to any role in the current seed (0034),
  -- so this branch is presently unreachable in production, but is kept
  -- correct: the self-department lookup below only touches employees for a
  -- row other than p_employee_id whenever 'self' is also granted (handled
  -- above already), which is the only combination this schema seeds today.
  if 'department' = any (v_scopes) and p_department is not null then
    select department into v_own_department from public.employees where id = v_self_employee;
    if v_own_department is not null and v_own_department = p_department then
      return true;
    end if;
  end if;

  -- business_unit/team scope: no business-unit or team table exists yet in
  -- this schema (spec §9/§11 — deferred to a Phase 2 organisation hierarchy).
  return false;
end;
$$;

-- Employee document resolver. Takes employee_id directly (a plain column
-- on employee_documents — no query against employee_documents itself) and
-- resolves org/department via employees, a different table, which is safe
-- to query even when this function runs inside an employee_documents RLS
-- policy evaluated against a RETURNING row.
create or replace function public.user_can_access_document(
  p_employee_id uuid,
  p_action public.rbac_action,
  p_sensitivity public.rbac_sensitivity default 'confidential'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_department text;
begin
  if p_employee_id is null then
    return false;
  end if;

  select org_id, department into v_org_id, v_department
  from public.employees
  where id = p_employee_id;

  if v_org_id is null then
    return false;
  end if;

  return public.user_can_access_employee(p_employee_id, v_org_id, v_department, p_action, p_sensitivity);
end;
$$;

-- Payslip resolver. Takes employee_id/payroll_run_id directly (plain
-- columns on payslips — no query against payslips itself) and resolves
-- the owning org via payroll_runs, a different table.
create or replace function public.user_can_access_payslip(
  p_employee_id uuid,
  p_payroll_run_id uuid,
  p_action public.rbac_action,
  p_sensitivity public.rbac_sensitivity default 'normal'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_self_employee uuid := public.current_employee_id();
  v_run_org uuid;
  v_scopes public.rbac_scope[];
begin
  if v_org is null or p_employee_id is null or p_payroll_run_id is null then
    return false;
  end if;

  select pr.org_id into v_run_org from public.payroll_runs pr where pr.id = p_payroll_run_id;

  if v_run_org is null or v_run_org <> v_org then
    return false;
  end if;

  select array_agg(s) into v_scopes from public.rbac_granted_scopes('payroll', p_action, p_sensitivity) s;
  if v_scopes is null then
    return false;
  end if;

  if 'organisation' = any (v_scopes) then
    return true;
  end if;

  if 'self' = any (v_scopes) and v_self_employee is not null and v_self_employee = p_employee_id then
    return true;
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. authorize_request() is a standalone RPC (app code calls it directly
--    to ask "can I do X to record Y"), never an RLS policy evaluated
--    against a RETURNING row, so resolving the record's columns itself
--    here is safe. Update its dispatch to the new resolver signatures.
-- ---------------------------------------------------------------------

create or replace function public.authorize_request(
  p_user_id uuid,
  p_resource text,
  p_action public.rbac_action,
  p_sensitivity public.rbac_sensitivity default 'normal',
  p_record_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_allowed boolean;
  v_scopes public.rbac_scope[];
  v_emp_org uuid;
  v_emp_department text;
  v_doc_employee uuid;
  v_ps_employee uuid;
  v_ps_run uuid;
begin
  if v_org_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'NO_ORGANISATION');
  end if;

  select array_agg(s) into v_scopes from public.rbac_granted_scopes(p_resource, p_action, p_sensitivity) s;
  if v_scopes is null or array_length(v_scopes, 1) is null then
    return jsonb_build_object('allowed', false, 'reason', 'PERMISSION_DENIED');
  end if;

  if p_record_id is not null then
    case p_resource
      when 'employees' then
        select org_id, department into v_emp_org, v_emp_department
        from public.employees where id = p_record_id;
        v_allowed := v_emp_org is not null
          and public.user_can_access_employee(p_record_id, v_emp_org, v_emp_department, p_action, p_sensitivity);
      when 'documents' then
        select employee_id into v_doc_employee
        from public.employee_documents where id = p_record_id;
        v_allowed := v_doc_employee is not null
          and public.user_can_access_document(v_doc_employee, p_action, p_sensitivity);
      when 'payroll' then
        select employee_id, payroll_run_id into v_ps_employee, v_ps_run
        from public.payslips where id = p_record_id;
        v_allowed := v_ps_employee is not null
          and public.user_can_access_payslip(v_ps_employee, v_ps_run, p_action, p_sensitivity);
      else
        -- Resource/action/sensitivity permission exists, but no record-level
        -- resolver has been built for this resource yet. Fall back to the
        -- coarse organisation-scope check rather than silently denying.
        v_allowed := ('organisation' = any (v_scopes));
    end case;
    if not coalesce(v_allowed, false) then
      return jsonb_build_object('allowed', false, 'reason', 'PERMISSION_DENIED', 'scopes', to_jsonb(v_scopes));
    end if;
    return jsonb_build_object('allowed', true, 'scopes', to_jsonb(v_scopes));
  end if;

  return jsonb_build_object('allowed', true, 'scopes', to_jsonb(v_scopes));
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Recreate the RESTRICTIVE policies, passing row columns directly
--    instead of just the row id.
-- ---------------------------------------------------------------------

create policy "employees_select_rbac" on public.employees
  as restrictive
  for select to authenticated
  using (public.user_can_access_employee(id, org_id, department, 'view', 'normal'));

create policy "employees_update_rbac" on public.employees
  as restrictive
  for update to authenticated
  using (public.user_can_access_employee(id, org_id, department, 'edit', 'normal'))
  with check (public.user_can_access_employee(id, org_id, department, 'edit', 'normal'));

create policy "employee_documents_select_rbac" on public.employee_documents
  as restrictive
  for select to authenticated
  using (public.user_can_access_document(employee_id, 'view', 'confidential'));

create policy "employee_documents_update_rbac" on public.employee_documents
  as restrictive
  for update to authenticated
  using (public.user_can_access_document(employee_id, 'edit', 'confidential'))
  with check (
    exists (select 1 from public.employees e where e.id = employee_id and e.org_id = current_org_id())
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('documents', 'edit', 'confidential') s))
  );

create policy "employee_documents_delete_rbac" on public.employee_documents
  as restrictive
  for delete to authenticated
  using (public.user_can_access_document(employee_id, 'edit', 'confidential'));

create policy "payslips_select_rbac" on public.payslips
  as restrictive
  for select to authenticated
  using (public.user_can_access_payslip(employee_id, payroll_run_id, 'view', 'normal'));

create policy "payslips_update_rbac" on public.payslips
  as restrictive
  for update to authenticated
  using (public.user_can_access_payslip(employee_id, payroll_run_id, 'edit', 'highly_restricted'))
  with check (
    exists (select 1 from public.payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
    and 'organisation' = any (array(select s from public.rbac_granted_scopes('payroll', 'edit', 'highly_restricted') s))
  );
