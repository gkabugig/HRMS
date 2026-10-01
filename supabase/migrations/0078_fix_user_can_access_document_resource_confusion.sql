-- Area 06 bug found while testing the manager-safe Employee 360's documents
-- panel: user_can_access_document() delegates to user_can_access_employee(),
-- which resolves scope via rbac_granted_scopes('employees', p_action,
-- p_sensitivity) — the 'employees' resource, not 'documents'. Those are
-- independently seeded: manager holds documents/view/confidential ->
-- direct_reports (exactly what's needed for employee_documents_select_rbac,
-- the RESTRICTIVE policy that calls this function), but was never granted
-- employees/view/confidential at all (only employees/view/normal exists).
-- Delegating to the employees resolver therefore silently denied every
-- manager document read at the 'confidential' sensitivity tier regardless
-- of the correct, intentional documents-scope grant. Fixed by resolving
-- scope against 'documents' directly, mirroring user_can_access_employee's
-- own org/self/direct_reports/department/business_unit/team logic rather
-- than re-delegating to a different resource's grants.
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
  v_org uuid := public.current_org_id();
  v_self_employee uuid := public.current_employee_id();
  v_org_id uuid;
  v_department text;
  v_own_department text;
  v_scopes public.rbac_scope[];
  v_self_unit uuid;
  v_target_unit uuid;
  v_self_ancestor uuid;
  v_target_ancestor uuid;
begin
  if p_employee_id is null or v_org is null then
    return false;
  end if;

  select org_id, department into v_org_id, v_department from public.employees where id = p_employee_id;
  if v_org_id is null or v_org_id <> v_org then
    return false;
  end if;

  select array_agg(s) into v_scopes from public.rbac_granted_scopes('documents', p_action, p_sensitivity) s;
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
    elsif v_department is not null then
      select department into v_own_department from public.employees where id = v_self_employee;
      if v_own_department is not null and v_own_department = v_department then
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
