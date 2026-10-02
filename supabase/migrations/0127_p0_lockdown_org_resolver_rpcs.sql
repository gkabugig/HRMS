-- P0 SECURITY HARDENING (SEC-001/SEC-003): get_current_manager_id,
-- get_direct_reports, and get_current_assignment_unit (0056, 0071) are
-- SECURITY DEFINER functions that accept an arbitrary caller-supplied
-- employee/manager id with no check that the target even belongs to the
-- caller's own organisation. They are called via supabase.rpc(...) from the
-- app's own session-scoped client (src/lib/organisation/get-current-manager.ts,
-- src/lib/organisation/get-direct-reports.ts, src/lib/compensation/budget-check.ts)
-- but a Postgres function is also, by default, directly callable by any
-- authenticated user through PostgREST (GRANT EXECUTE TO PUBLIC is the
-- default on function creation) - entirely bypassing the app code that
-- calls it today. Since none of the three ever checks organisation
-- membership, any authenticated user in ANY org can call
-- `supabase.rpc('get_current_manager_id', { p_employee_id: '<uuid from a
-- different org>' })` directly and get back that employee's manager id (or
-- reports, or org unit) - a cross-tenant IDOR/enumeration leak via RPC that
-- never touches a single RLS-protected table read.
--
-- Fix, mirroring 0004_harden_functions.sql's existing pattern for the
-- identity-helper functions: revoke execute from anon (no legitimate
-- unauthenticated caller), and - since `authenticated` genuinely needs to
-- keep calling these for their own org's employees - add an org_id check
-- inside each function itself so a target outside the caller's
-- current_org_id() resolves to no rows/null instead of leaking across
-- tenants. org_unit_ancestor_of_type is left untouched: it takes an
-- org-unit id, not an employee id, and organisation_units has no per-row
-- tenant-sensitive data beyond structure already visible via its own RLS -
-- out of scope for this specific IDOR class.
revoke execute on function public.get_current_manager_id(uuid, date) from anon;
revoke execute on function public.get_direct_reports(uuid, date) from anon;
revoke execute on function public.get_current_assignment_unit(uuid, date) from anon;

create or replace function public.get_current_manager_id(p_employee_id uuid, p_as_of date default current_date)
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select rr.manager_id
  from public.reporting_relationships rr
  join public.employees e on e.id = rr.employee_id
  where rr.employee_id = p_employee_id
    and e.org_id = current_org_id()
    and rr.relationship_type = 'line_manager'
    and rr.is_primary
    and rr.effective_from <= p_as_of
    and (rr.effective_to is null or rr.effective_to >= p_as_of)
  order by rr.effective_from desc
  limit 1;
$$;

create or replace function public.get_direct_reports(p_manager_employee_id uuid, p_as_of date default current_date)
returns table(employee_id uuid)
language sql
stable security definer
set search_path = public
as $$
  select rr.employee_id
  from public.reporting_relationships rr
  join public.employees e on e.id = rr.manager_id
  where rr.manager_id = p_manager_employee_id
    and e.org_id = current_org_id()
    and rr.relationship_type = 'line_manager'
    and rr.is_primary
    and rr.effective_from <= p_as_of
    and (rr.effective_to is null or rr.effective_to >= p_as_of);
$$;

create or replace function public.get_current_assignment_unit(p_employee_id uuid, p_as_of date default current_date)
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select p.organisation_unit_id
  from public.employee_positions ep
  join public.positions p on p.id = ep.position_id
  join public.employees e on e.id = ep.employee_id
  where ep.employee_id = p_employee_id
    and e.org_id = current_org_id()
    and ep.is_primary
    and ep.effective_from <= p_as_of
    and (ep.effective_to is null or ep.effective_to >= p_as_of)
  order by ep.effective_from desc
  limit 1;
$$;
