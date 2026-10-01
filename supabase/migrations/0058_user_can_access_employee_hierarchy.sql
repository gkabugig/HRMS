-- RBAC integration (spec §25) — Area 01's user_can_access_employee()
-- (0035_universal_rbac_authorization.sql) stops using employees.department
-- text-equality as the *authoritative* basis for department scope, and
-- gains real business_unit/team scope support (both existed in the
-- rbac_scope enum but were previously unimplemented — any role granted them
-- had no working code path at all). Falls back to the legacy text compare
-- only when an employee has no authoritative assignment yet, so nothing
-- already relying on department scope breaks mid-migration for employees
-- not yet backed by an employee_positions row.
--
-- NOTE — a second, independent bug found while live-testing this change:
-- employees_select_rbac/employees_update_rbac (also from 0035) are RLS
-- RESTRICTIVE policies, which can only narrow access already granted by a
-- PERMISSIVE policy — they can never grant it on their own. Since the only
-- permissive SELECT/UPDATE policies on employees cover self/direct_reports/
-- hr, any role granted 'organisation', 'department', 'business_unit' or
-- 'team' scope has had NO working access path at all since Area 01 shipped,
-- regardless of what this function returns. That is fixed separately in
-- 0062_employees_rbac_scope_grants_permissive.sql (additively, since DROP
-- POLICY could not be run non-interactively in this environment).
create or replace function public.user_can_access_employee(
  p_employee_id uuid,
  p_org_id uuid,
  p_department text,
  p_action rbac_action,
  p_sensitivity rbac_sensitivity default 'normal'::rbac_sensitivity
)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_self_employee uuid := public.current_employee_id();
  v_own_department text;
  v_scopes public.rbac_scope[];
  v_self_unit uuid;
  v_target_unit uuid;
  v_self_ancestor uuid;
  v_target_ancestor uuid;
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

  if 'department' = any (v_scopes) and v_self_employee is not null then
    v_self_unit := public.get_current_assignment_unit(v_self_employee);
    v_target_unit := public.get_current_assignment_unit(p_employee_id);
    if v_self_unit is not null and v_target_unit is not null then
      if v_self_unit = v_target_unit then
        return true;
      end if;
    elsif p_department is not null then
      -- Compatibility fallback: one side has no authoritative assignment
      -- yet (not backfilled, or newly created without a position), so fall
      -- back to the legacy text field rather than denying access outright.
      select department into v_own_department from public.employees where id = v_self_employee;
      if v_own_department is not null and v_own_department = p_department then
        return true;
      end if;
    end if;
  end if;

  if 'business_unit' = any (v_scopes) and v_self_employee is not null then
    v_self_unit := coalesce(v_self_unit, public.get_current_assignment_unit(v_self_employee));
    v_target_unit := coalesce(v_target_unit, public.get_current_assignment_unit(p_employee_id));
    if v_self_unit is not null and v_target_unit is not null then
      v_self_ancestor := public.org_unit_ancestor_of_type(v_self_unit, 'business_unit');
      v_target_ancestor := public.org_unit_ancestor_of_type(v_target_unit, 'business_unit');
      if v_self_ancestor is not null and v_self_ancestor = v_target_ancestor then
        return true;
      end if;
    end if;
  end if;

  if 'team' = any (v_scopes) and v_self_employee is not null then
    v_self_unit := coalesce(v_self_unit, public.get_current_assignment_unit(v_self_employee));
    v_target_unit := coalesce(v_target_unit, public.get_current_assignment_unit(p_employee_id));
    if v_self_unit is not null and v_target_unit is not null then
      v_self_ancestor := public.org_unit_ancestor_of_type(v_self_unit, 'team');
      v_target_ancestor := public.org_unit_ancestor_of_type(v_target_unit, 'team');
      if v_self_ancestor is not null and v_self_ancestor = v_target_ancestor then
        return true;
      end if;
    end if;
  end if;

  return false;
end;
$$;
