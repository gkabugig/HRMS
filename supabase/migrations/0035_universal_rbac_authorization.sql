-- Universal RBAC — authorization functions.
--
-- Hardening vs. the supplied spec: authorize_request() accepts p_user_id
-- (so its signature matches what the TypeScript authorize() wrapper calls
-- it with) but never trusts it for the actual decision — it always
-- resolves the caller's identity from auth.uid(), same as every other
-- SECURITY DEFINER function in this codebase. "The database must
-- independently verify the request" (spec §8) means independently of the
-- client-supplied argument too, not just independently of the UI.
--
-- Fix vs. the spec's draft SQL: the draft picked one arbitrary granted
-- scope per resource/action/sensitivity (`limit 1`). A role can legitimately
-- hold more than one scope for the same permission (a manager has both
-- 'self' and 'direct_reports' for employees.view) — picking one at random
-- would non-deterministically deny access half the time. These functions
-- check every granted scope and allow if *any* of them resolves true.

-- All scopes a role in the current org holds for a given permission.
create or replace function public.rbac_granted_scopes(
  p_resource text,
  p_action public.rbac_action,
  p_sensitivity public.rbac_sensitivity default 'normal'
)
returns setof public.rbac_scope
language sql
stable
security definer
set search_path = public
as $$
  select distinct rp.scope
  from public.rbac_user_roles ur
  join public.rbac_role_permissions rp on rp.role_id = ur.role_id
  join public.rbac_permissions p on p.id = rp.permission_id
  where ur.user_id = auth.uid()
    and ur.org_id = public.current_org_id()
    and p.resource = p_resource
    and p.action = p_action
    and p.sensitivity = p_sensitivity;
$$;

-- Coarse, non-record-specific gate ("can this user even reach the Approve
-- Payroll button"). Record-level decisions go through the resource-specific
-- resolvers below instead, dispatched here when p_record_id is given for a
-- resource that has one implemented.
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
begin
  if v_org_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'NO_ORGANISATION');
  end if;

  select array_agg(s) into v_scopes from public.rbac_granted_scopes(p_resource, p_action, p_sensitivity) s;
  if v_scopes is null or array_length(v_scopes, 1) is null then
    return jsonb_build_object('allowed', false, 'reason', 'PERMISSION_DENIED');
  end if;

  if p_record_id is not null then
    v_allowed := case p_resource
      when 'employees' then public.user_can_access_employee(p_record_id, p_action, p_sensitivity)
      when 'documents' then public.user_can_access_document(p_record_id, p_action, p_sensitivity)
      when 'payroll' then public.user_can_access_payslip(p_record_id, p_action, p_sensitivity)
      -- Resource/action/sensitivity permission exists, but no record-level
      -- resolver has been built for this resource yet (spec §8's "Phase 1
      -- implementation": organisation scope is allowed, record-level scope
      -- checks are added resource by resource). Fall back to the coarse
      -- organisation-scope check rather than silently denying.
      else ('organisation' = any (v_scopes))
    end;
    if not coalesce(v_allowed, false) then
      return jsonb_build_object('allowed', false, 'reason', 'PERMISSION_DENIED', 'scopes', to_jsonb(v_scopes));
    end if;
    return jsonb_build_object('allowed', true, 'scopes', to_jsonb(v_scopes));
  end if;

  return jsonb_build_object('allowed', true, 'scopes', to_jsonb(v_scopes));
end;
$$;

-- Employee record resolver. Adapted from the spec: employees has no
-- user_id column, so "self" is resolved through current_employee_id()
-- (app_users.employee_id) instead, and "direct_reports" reuses the
-- existing is_manager_of() rather than re-deriving reporting_manager_id.
create or replace function public.user_can_access_employee(
  p_employee_id uuid,
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
  if v_org is null then
    return false;
  end if;

  select array_agg(s) into v_scopes from public.rbac_granted_scopes('employees', p_action, p_sensitivity) s;
  if v_scopes is null then
    return false;
  end if;

  if 'organisation' = any (v_scopes) then
    return exists (select 1 from public.employees e where e.id = p_employee_id and e.org_id = v_org);
  end if;

  if 'self' = any (v_scopes) and v_self_employee is not null and v_self_employee = p_employee_id then
    return true;
  end if;

  if 'direct_reports' = any (v_scopes) and public.is_manager_of(p_employee_id) then
    return true;
  end if;

  if 'department' = any (v_scopes) then
    select department into v_own_department from public.employees where id = v_self_employee;
    if v_own_department is not null and exists (
      select 1 from public.employees e where e.id = p_employee_id and e.org_id = v_org and e.department = v_own_department
    ) then
      return true;
    end if;
  end if;

  -- business_unit/team scope: no business-unit or team table exists yet in
  -- this schema (spec §9/§11 — "should be implemented against the
  -- authoritative Phase 2 organisation hierarchy" once one exists).
  return false;
end;
$$;

-- Employee document resolver, keyed through employee_documents.employee_id.
-- The table's own `visibility`/manager-visibility condition
-- (employee_documents_manager_visible) is a separate, per-document concern
-- and stays enforced directly in that table's own RLS policy — this
-- function only answers the RBAC scope question ("is this manager allowed
-- to look at documents for this employee at all").
create or replace function public.user_can_access_document(
  p_document_id uuid,
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
  v_employee_id uuid;
begin
  select employee_id into v_employee_id from public.employee_documents where id = p_document_id;
  if v_employee_id is null then
    return false;
  end if;
  return public.user_can_access_employee(v_employee_id, p_action, p_sensitivity);
end;
$$;

-- Payslip resolver. Organisation scope is verified through the owning
-- payroll_runs.org_id (payslips itself carries no org_id), matching the
-- existing payslips_hr_full policy's own join.
create or replace function public.user_can_access_payslip(
  p_payslip_id uuid,
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
  v_employee_id uuid;
  v_run_org uuid;
  v_scopes public.rbac_scope[];
begin
  if v_org is null then
    return false;
  end if;

  select ps.employee_id, pr.org_id into v_employee_id, v_run_org
  from public.payslips ps
  join public.payroll_runs pr on pr.id = ps.payroll_run_id
  where ps.id = p_payslip_id;

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

  if 'self' = any (v_scopes) and v_self_employee is not null and v_self_employee = v_employee_id then
    return true;
  end if;

  return false;
end;
$$;
