-- Area 06 nav wiring (mirrors 0067's pattern for Area 05): add the new
-- manager-* module keys for every org that already has role_module_permissions
-- rows for the manager role, and turn off the superseded shared keys
-- (attendance/leave/performance — replaced by the manager workspace
-- equivalents) plus disciplinary (manager access was locked down in 0074,
-- so leaving the nav entry on would point at a page that now shows nothing).
do $$
declare
  org record;
  new_keys text[] := array['manager-team','manager-attendance','manager-leave','manager-performance','manager-learning','manager-recruitment','manager-requests','manager-analytics','manager-organisation'];
  k text;
begin
  for org in select distinct org_id from role_module_permissions where role = 'manager' loop
    foreach k in array new_keys loop
      insert into role_module_permissions (org_id, role, module_key, can_view)
      values (org.org_id, 'manager', k, true)
      on conflict (org_id, role, module_key) do update set can_view = true;
    end loop;

    update role_module_permissions
      set can_view = false
      where org_id = org.org_id and role = 'manager' and module_key in ('attendance','leave','performance','disciplinary');
  end loop;
end $$;
