-- Hierarchy integrity: walks the parent chain and rejects a cycle before it
-- can be written (spec §8 "A unit cannot be its own ancestor"). Kept as a
-- separate function/trigger pair (this file + 0055) because this
-- environment's migration tool requires confirmation for CREATE TRIGGER
-- that could not be obtained non-interactively — splitting them out made
-- each individual statement apply cleanly.
create or replace function public.prevent_org_unit_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current uuid;
  v_depth int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  v_current := new.parent_id;
  while v_current is not null loop
    if v_current = new.id then
      raise exception 'Circular organisation hierarchy: % would become an ancestor of itself', new.id;
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      raise exception 'Organisation hierarchy too deep or already cyclic (over 100 levels)';
    end if;
    select parent_id into v_current from public.organisation_units where id = v_current;
  end loop;
  return new;
end;
$$;
