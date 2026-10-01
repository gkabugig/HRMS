-- Compatibility view (spec §15, adapted to the real column names). Security
-- invoker is set explicitly in 0061 after the Supabase security-definer-view
-- advisory flagged the default — see that file's comment for why.
create or replace view public.employee_current_org_view as
select
  e.id as employee_id,
  e.org_id,
  ep.position_id,
  p.position_code,
  p.title as position_title,
  p.approved_headcount,
  ou.id as organisation_unit_id,
  ou.name as organisation_unit_name,
  ou.unit_type,
  l.id as location_id,
  l.name as location_name,
  cc.id as cost_centre_id,
  cc.name as cost_centre_name,
  rr.manager_id as current_manager_id,
  ep.effective_from as assignment_effective_from
from public.employees e
join public.employee_positions ep
  on ep.employee_id = e.id
  and ep.is_primary = true
  and ep.effective_from <= current_date
  and (ep.effective_to is null or ep.effective_to >= current_date)
join public.positions p on p.id = ep.position_id
left join public.organisation_units ou on ou.id = p.organisation_unit_id
left join public.locations l on l.id = p.location_id
left join public.cost_centres cc on cc.id = p.cost_centre_id
left join public.reporting_relationships rr
  on rr.employee_id = e.id
  and rr.relationship_type = 'line_manager'
  and rr.is_primary = true
  and rr.effective_from <= current_date
  and (rr.effective_to is null or rr.effective_to >= current_date);

grant select on public.employee_current_org_view to authenticated;
