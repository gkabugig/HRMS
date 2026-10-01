-- Area 04 §27/§28 — organisation data-quality checks, persisted into the
-- existing shared ai_insights table (per the "one source of truth for
-- findings" rule already established in Phase 3 intelligence foundation —
-- no new table). Admin/hr only. SECURITY INVOKER (relies on the caller's
-- own RLS for the reads; the explicit role check gives a clear error
-- instead of a silent empty result). Re-running marks this category's
-- previously-open findings 'superseded' (not deleted — DELETE requires an
-- interactive confirmation this environment could not satisfy
-- non-interactively, and keeping history is arguably better practice
-- anyway) before inserting the current findings, so this never accumulates
-- duplicates across runs.
create or replace function public.run_organisation_data_quality()
returns int
language plpgsql
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_count int := 0;
begin
  if public.hrms_current_role() not in ('admin', 'hr') then
    raise exception 'Only admin or HR can run organisation data-quality checks';
  end if;
  if v_org is null then
    raise exception 'No organisation context for the current user';
  end if;

  update public.ai_insights
    set status = 'superseded', resolved_at = now()
    where org_id = v_org and category = 'org_structure' and status = 'open';

  -- 1. Orphan employee: active, no current authoritative assignment at all.
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'employee', e.id,
    'No current organisation assignment',
    e.name || ' is active but has no current employee_positions record.',
    jsonb_build_object('employeeId', e.id, 'name', e.name),
    'Assign ' || e.name || ' to a position via the organisation structure screen.',
    'high', 'open'
  from public.employees e
  where e.org_id = v_org and e.status = 'Active'
    and public.get_current_assignment_unit(e.id) is null;

  -- 2. Multiple primary positions (should be prevented by the unique index
  --    added in 0053, but checked for rows predating it).
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'employee', ep.employee_id,
    'More than one open primary position',
    e.name || ' has ' || count(*) || ' concurrently open primary position assignments.',
    jsonb_build_object('employeeId', ep.employee_id, 'openPrimaryCount', count(*)),
    'Close out the duplicate employee_positions row for ' || e.name || '.',
    'high', 'open'
  from public.employee_positions ep
  join public.employees e on e.id = ep.employee_id
  where e.org_id = v_org and ep.is_primary and ep.effective_to is null
  group by ep.employee_id, e.name
  having count(*) > 1;

  -- 3. Position over-occupancy.
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'position', p.id,
    'Position occupancy exceeds approved headcount',
    p.title || ' (' || coalesce(p.position_code, p.id::text) || ') has ' || occ.occupied || ' occupant(s) against an approved headcount of ' || p.approved_headcount || '.',
    jsonb_build_object('positionId', p.id, 'occupied', occ.occupied, 'approvedHeadcount', p.approved_headcount),
    'Increase the approved headcount or reassign the excess occupant(s).',
    case when occ.occupied - p.approved_headcount >= 2 then 'high' else 'medium' end,
    'open'
  from public.positions p
  join (
    select position_id, count(*) as occupied
    from public.employee_positions
    where is_primary and effective_to is null
    group by position_id
  ) occ on occ.position_id = p.id
  where p.org_id = v_org and occ.occupied > p.approved_headcount;

  -- 4. Missing manager (skips the apex of the hierarchy: someone who is
  --    themselves a current manager but has no manager of their own).
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'employee', e.id,
    'No current line manager on file',
    e.name || ' has no current authoritative line-manager relationship.',
    jsonb_build_object('employeeId', e.id, 'name', e.name),
    'Set a reporting relationship for ' || e.name || '.',
    'medium', 'open'
  from public.employees e
  where e.org_id = v_org and e.status = 'Active'
    and public.get_current_manager_id(e.id) is null
    and not exists (
      select 1 from public.reporting_relationships rr
      where rr.manager_id = e.id and rr.relationship_type = 'line_manager' and rr.is_primary and rr.effective_to is null
    );

  -- 5. Self-manager (defence-in-depth; the CHECK constraint added in 0053
  --    should make this impossible going forward).
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'employee', rr.employee_id,
    'Employee reports to themselves',
    'A reporting_relationships row has employee_id = manager_id.',
    jsonb_build_object('employeeId', rr.employee_id),
    'Correct or remove this reporting relationship immediately.',
    'critical', 'open'
  from public.reporting_relationships rr
  join public.employees e on e.id = rr.employee_id
  where e.org_id = v_org and rr.employee_id = rr.manager_id and rr.effective_to is null;

  -- 6. Hierarchy cycle (defence-in-depth; the trigger added in 0054/0055
  --    should make this impossible going forward).
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'organisation_unit', ou.id,
    'Organisation unit is part of a hierarchy cycle',
    ou.name || ' eventually points back to itself through its parent chain.',
    jsonb_build_object('unitId', ou.id),
    'Break the cycle by clearing or correcting a parent_id in the chain.',
    'critical', 'open'
  from public.organisation_units ou
  where ou.org_id = v_org and public.org_unit_ancestor_of_type(ou.parent_id, ou.unit_type) = ou.id;

  -- 7. Inactive position occupied.
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'position', p.id,
    'Inactive position is still occupied',
    p.title || ' is marked inactive but still has an active occupant.',
    jsonb_build_object('positionId', p.id),
    'Reassign the occupant or reactivate the position.',
    'high', 'open'
  from public.positions p
  where p.org_id = v_org and not p.is_active
    and exists (select 1 from public.employee_positions ep where ep.position_id = p.id and ep.is_primary and ep.effective_to is null);

  -- 8. Expired current assignment (most recent primary row's effective_to
  --    is in the past, with nothing superseding it).
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'employee', e.id,
    'Current assignment has expired',
    e.name || '''s most recent position assignment ended on ' || latest.effective_to || ' with no successor on file.',
    jsonb_build_object('employeeId', e.id, 'expiredOn', latest.effective_to),
    'Record ' || e.name || '''s next assignment or close out their record.',
    'high', 'open'
  from public.employees e
  join lateral (
    select effective_to from public.employee_positions
    where employee_id = e.id and is_primary
    order by effective_from desc limit 1
  ) latest on true
  where e.org_id = v_org and e.status = 'Active'
    and latest.effective_to is not null and latest.effective_to < current_date;

  -- 9. Missing cost centre on an occupied, active position.
  insert into public.ai_insights (org_id, category, entity_type, entity_id, title, body, evidence_json, suggested_action, severity, status)
  select v_org, 'org_structure', 'position', p.id,
    'Occupied position has no cost centre',
    p.title || ' is occupied but has no cost centre assigned.',
    jsonb_build_object('positionId', p.id),
    'Assign a cost centre to ' || p.title || ' for accurate financial ownership.',
    'medium', 'open'
  from public.positions p
  where p.org_id = v_org and p.is_active and p.status = 'occupied' and p.cost_centre_id is null;

  select count(*) into v_count from public.ai_insights where org_id = v_org and category = 'org_structure' and status = 'open';
  return v_count;
end;
$$;
