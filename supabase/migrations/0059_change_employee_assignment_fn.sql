-- Transactional assignment change (spec §19). A plain Postgres function
-- body is one transaction by construction, so this satisfies "execute
-- transactionally" without needing a client-side multi-statement
-- transaction (which supabase-js cannot do against PostgREST anyway).
-- SECURITY INVOKER (the default — no "security definer" below) so every
-- write still goes through the caller's own RLS; the explicit
-- hrms_current_role() check up front exists to turn an RLS rejection into a
-- clear error message rather than a silent partial failure.
create or replace function public.change_employee_assignment(
  p_employee_id uuid,
  p_position_id uuid,
  p_manager_id uuid,
  p_effective_from date,
  p_reason text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_actor uuid := auth.uid();
  v_emp_org uuid;
  v_pos_org uuid;
  v_pos_unit uuid;
  v_pos_active boolean;
  v_pos_title text;
  v_unit_name text;
  v_old_position_id uuid;
  v_old_unit_id uuid;
  v_old_manager_id uuid;
  v_old_effective_from date;
  v_close_date date;
  v_mgr_org uuid;
begin
  if public.hrms_current_role() not in ('admin', 'hr') then
    raise exception 'Only admin or HR can change an employee''s organisation assignment';
  end if;
  if v_org is null then
    raise exception 'No organisation context for the current user';
  end if;
  if p_employee_id is null or p_position_id is null or p_effective_from is null then
    raise exception 'employeeId, positionId and effectiveFrom are required';
  end if;

  select org_id into v_emp_org from public.employees where id = p_employee_id;
  if v_emp_org is null or v_emp_org <> v_org then
    raise exception 'Employee not found in your organisation';
  end if;

  select org_id, organisation_unit_id, is_active, title
    into v_pos_org, v_pos_unit, v_pos_active, v_pos_title
    from public.positions where id = p_position_id;
  if v_pos_org is null or v_pos_org <> v_org then
    raise exception 'Position not found in your organisation';
  end if;
  if not coalesce(v_pos_active, true) then
    raise exception 'Cannot assign an employee to an inactive position';
  end if;

  if p_manager_id is not null then
    if p_manager_id = p_employee_id then
      raise exception 'An employee cannot be their own manager';
    end if;
    select org_id into v_mgr_org from public.employees where id = p_manager_id;
    if v_mgr_org is null or v_mgr_org <> v_org then
      raise exception 'Manager not found in your organisation';
    end if;
  end if;

  select position_id, effective_from into v_old_position_id, v_old_effective_from
    from public.employee_positions
    where employee_id = p_employee_id and is_primary and effective_to is null
    order by effective_from desc limit 1;

  if v_old_effective_from is not null and p_effective_from <= v_old_effective_from then
    raise exception 'The new effective date must be after the current assignment''s start date (%)', v_old_effective_from;
  end if;

  if v_old_position_id is not null then
    select organisation_unit_id into v_old_unit_id from public.positions where id = v_old_position_id;
  end if;

  select manager_id into v_old_manager_id
    from public.reporting_relationships
    where employee_id = p_employee_id and relationship_type = 'line_manager' and is_primary and effective_to is null
    order by effective_from desc limit 1;

  v_close_date := p_effective_from - 1;

  -- Close the previous assignment (never rewritten, only closed out).
  update public.employee_positions
    set effective_to = v_close_date
    where employee_id = p_employee_id and is_primary and effective_to is null;

  insert into public.employee_positions (employee_id, position_id, effective_from, is_primary, reason)
    values (p_employee_id, p_position_id, p_effective_from, true, p_reason);

  update public.positions set status = 'occupied' where id = p_position_id;

  -- Recompute the vacated position's status if it's no longer occupied by
  -- anyone else's current primary assignment.
  if v_old_position_id is not null and v_old_position_id <> p_position_id then
    update public.positions
      set status = 'vacant'
      where id = v_old_position_id
        and not exists (
          select 1 from public.employee_positions ep2
          where ep2.position_id = v_old_position_id and ep2.is_primary and ep2.effective_to is null
        );
  end if;

  -- Reporting relationship: only touched when a manager was actually
  -- supplied and differs from the one already on file.
  if p_manager_id is not null and p_manager_id is distinct from v_old_manager_id then
    update public.reporting_relationships
      set effective_to = v_close_date
      where employee_id = p_employee_id and relationship_type = 'line_manager' and is_primary and effective_to is null;

    insert into public.reporting_relationships (employee_id, manager_id, relationship_type, is_primary, effective_from)
      values (p_employee_id, p_manager_id, 'line_manager', true, p_effective_from);
  end if;

  -- Compatibility sync — keep the legacy fields truthful for every reader
  -- that hasn't migrated onto the resolvers/view yet (spec §16.16).
  select name into v_unit_name from public.organisation_units where id = v_pos_unit;
  update public.employees
    set department = coalesce(v_unit_name, department),
        reporting_manager_id = coalesce(p_manager_id, v_old_manager_id, reporting_manager_id)
    where id = p_employee_id;

  insert into public.domain_events (org_id, event_type, entity_type, entity_id, actor_id, payload_json)
    values (
      v_org, 'employee.organisation_assignment_changed', 'employee', p_employee_id, v_actor,
      jsonb_build_object(
        'employeeId', p_employee_id,
        'oldPositionId', v_old_position_id,
        'newPositionId', p_position_id,
        'oldUnitId', v_old_unit_id,
        'newUnitId', v_pos_unit,
        'oldManagerId', v_old_manager_id,
        'newManagerId', coalesce(p_manager_id, v_old_manager_id),
        'effectiveFrom', p_effective_from,
        'reason', p_reason
      )
    );

  insert into public.audit_events (org_id, actor_user_id, action, resource_type, resource_id, event_category, before_json, after_json)
    values (
      v_org, v_actor, 'employee.organisation_assignment_changed', 'employee', p_employee_id, 'data',
      jsonb_build_object('positionId', v_old_position_id, 'unitId', v_old_unit_id, 'managerId', v_old_manager_id),
      jsonb_build_object('positionId', p_position_id, 'unitId', v_pos_unit, 'managerId', coalesce(p_manager_id, v_old_manager_id), 'effectiveFrom', p_effective_from, 'reason', p_reason)
    );

  return jsonb_build_object(
    'employeeId', p_employee_id,
    'positionId', p_position_id,
    'positionTitle', v_pos_title,
    'unitId', v_pos_unit,
    'unitName', v_unit_name,
    'managerId', coalesce(p_manager_id, v_old_manager_id),
    'effectiveFrom', p_effective_from
  );
end;
$$;
