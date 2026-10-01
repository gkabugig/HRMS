-- Area 06 — the mirror of get_current_manager_id() (0056): given a manager's
-- employeeId, returns their current direct reports as of a date, from the
-- same authoritative, effective-dated reporting_relationships source. No
-- resolver for this direction existed before Area 06 (confirmed by
-- inspection) — every manager-facing query in the app relied on RLS
-- (is_manager_of(), called per-row) rather than ever asking "who are my
-- reports" as a set. SECURITY DEFINER for the same reason as
-- get_current_manager_id: reporting_relationships' own RLS is
-- self/manager/hr-scoped, and this needs to work uniformly for any caller
-- asking about their OWN reports, not depend on the caller's raw table
-- visibility into other managers' rows.
create or replace function public.get_direct_reports(p_manager_employee_id uuid, p_as_of date default current_date)
returns table(employee_id uuid)
language sql
stable security definer
set search_path = public
as $$
  select rr.employee_id
  from public.reporting_relationships rr
  where rr.manager_id = p_manager_employee_id
    and rr.relationship_type = 'line_manager'
    and rr.is_primary
    and rr.effective_from <= p_as_of
    and (rr.effective_to is null or rr.effective_to >= p_as_of);
$$;
