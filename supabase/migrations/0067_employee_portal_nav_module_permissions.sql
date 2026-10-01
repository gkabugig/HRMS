-- Area 05 nav wiring: role_module_permissions (0014) is what actually
-- decides sidebar visibility per org/role — src/lib/auth/roles.ts's
-- DEFAULT_VISIBLE_MODULES is only the fallback for an org with no rows yet.
-- Every org that already has rows (i.e. already went through that seed)
-- needs the new "me-*" module keys added for the employee role, and the
-- old shared keys (leave/payroll/documents) turned off for that role so the
-- employee doesn't see both the old bare module and its new /dashboard/me/*
-- replacement in the sidebar at once. attendance was already can_view=false
-- for employee before this (pre-existing), so only me-attendance needs
-- adding, not an attendance toggle.
do $$
declare
  org record;
  new_keys text[] := array['me-profile','me-attendance','me-leave','me-pay','me-documents','me-tasks','me-help'];
  k text;
begin
  for org in select distinct org_id from role_module_permissions where role = 'employee' loop
    foreach k in array new_keys loop
      insert into role_module_permissions (org_id, role, module_key, can_view)
      values (org.org_id, 'employee', k, true)
      on conflict (org_id, role, module_key) do update set can_view = true;
    end loop;

    update role_module_permissions
      set can_view = false
      where org_id = org.org_id and role = 'employee' and module_key in ('leave','payroll','documents');
  end loop;
end $$;
