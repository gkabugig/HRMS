-- Authoritative resolvers (spec §12/§13, plus an ancestor-of-type helper for
-- RBAC §25). SECURITY DEFINER + fixed search_path, matching the existing
-- is_manager_of()/current_org_id() pattern (0002_rls.sql), since these are
-- called from inside RLS policies (user_can_access_employee) and must not
-- recurse back through RLS on the tables they read.
create or replace function public.get_current_assignment_unit(p_employee_id uuid, p_as_of date default current_date)
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select p.organisation_unit_id
  from public.employee_positions ep
  join public.positions p on p.id = ep.position_id
  where ep.employee_id = p_employee_id
    and ep.is_primary
    and ep.effective_from <= p_as_of
    and (ep.effective_to is null or ep.effective_to >= p_as_of)
  order by ep.effective_from desc
  limit 1;
$$;

create or replace function public.org_unit_ancestor_of_type(p_unit_id uuid, p_type public.org_unit_type)
returns uuid
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_current uuid := p_unit_id;
  v_current_type public.org_unit_type;
  v_depth int := 0;
begin
  while v_current is not null loop
    select unit_type into v_current_type from public.organisation_units where id = v_current;
    if v_current_type is null then
      return null;
    end if;
    if v_current_type = p_type then
      return v_current;
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      return null;
    end if;
    select parent_id into v_current from public.organisation_units where id = v_current;
  end loop;
  return null;
end;
$$;

create or replace function public.get_current_manager_id(p_employee_id uuid, p_as_of date default current_date)
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select rr.manager_id
  from public.reporting_relationships rr
  where rr.employee_id = p_employee_id
    and rr.relationship_type = 'line_manager'
    and rr.is_primary
    and rr.effective_from <= p_as_of
    and (rr.effective_to is null or rr.effective_to >= p_as_of)
  order by rr.effective_from desc
  limit 1;
$$;
