create trigger org_unit_cycle_guard
  before insert or update of parent_id on public.organisation_units
  for each row execute function public.prevent_org_unit_cycle();
