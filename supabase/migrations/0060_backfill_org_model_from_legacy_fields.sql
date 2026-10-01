-- Backfill — both tenants had ZERO rows in all six organisation tables at
-- the time this was written (confirmed via count(*) live), so this is a
-- pure insert, never an overwrite of anything authoritative. One
-- organisation_units row per distinct department name per org, one position
-- per employee (1:1, since nothing in the legacy data groups several
-- employees under one approved seat), one employee_positions row and —
-- where reporting_manager_id is set — one reporting_relationships row.
-- Idempotent: skipped entirely for any org that already has at least one
-- organisation_units row, so re-running this migration (or applying it to
-- an org that was backfilled by hand in the meantime) is a no-op.
do $$
declare
  v_org record;
  v_dept record;
  v_unit_id uuid;
  v_emp record;
  v_position_id uuid;
  v_seq int;
begin
  for v_org in select id from public.organizations loop
    if exists (select 1 from public.organisation_units where org_id = v_org.id) then
      continue;
    end if;

    for v_dept in
      select distinct department from public.employees where org_id = v_org.id and department is not null
    loop
      insert into public.organisation_units (org_id, name, unit_type)
      values (v_org.id, v_dept.department, 'department')
      returning id into v_unit_id;
    end loop;

    v_seq := 0;
    for v_emp in
      select e.id, e.job_title, e.department, e.reporting_manager_id, e.date_of_hire
      from public.employees e
      where e.org_id = v_org.id
      order by e.date_of_hire, e.created_at
    loop
      v_seq := v_seq + 1;
      select id into v_unit_id from public.organisation_units where org_id = v_org.id and name = v_emp.department and unit_type = 'department' limit 1;

      insert into public.positions (org_id, title, organisation_unit_id, approved_headcount, status, is_active, position_code)
      values (v_org.id, v_emp.job_title, v_unit_id, 1, 'occupied', true, 'POS-' || to_char(v_seq, 'FM0000'))
      returning id into v_position_id;

      insert into public.employee_positions (employee_id, position_id, effective_from, is_primary, reason)
      values (v_emp.id, v_position_id, coalesce(v_emp.date_of_hire, current_date), true, 'Area 04 backfill from legacy employee record');
    end loop;

    for v_emp in
      select id, reporting_manager_id, date_of_hire from public.employees
      where org_id = v_org.id and reporting_manager_id is not null
    loop
      insert into public.reporting_relationships (employee_id, manager_id, relationship_type, is_primary, effective_from)
      values (v_emp.id, v_emp.reporting_manager_id, 'line_manager', true, coalesce(v_emp.date_of_hire, current_date))
      on conflict do nothing;
    end loop;

    insert into public.audit_events (org_id, action, resource_type, event_category, after_json)
    values (
      v_org.id, 'organisation.backfilled_from_legacy_fields', 'organisation', 'configuration',
      jsonb_build_object(
        'unitsCreated', (select count(*) from public.organisation_units where org_id = v_org.id),
        'positionsCreated', (select count(*) from public.positions where org_id = v_org.id),
        'reportingRelationshipsCreated', (select count(*) from public.reporting_relationships rr join public.employees e on e.id = rr.employee_id where e.org_id = v_org.id)
      )
    );
  end loop;
end $$;
