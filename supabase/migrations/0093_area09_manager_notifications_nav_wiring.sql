-- Mirrors 0076's pattern: grant the new manager-notifications module key
-- for every org that already has role_module_permissions rows for the
-- manager role.
do $$
declare
  org record;
begin
  for org in select distinct org_id from role_module_permissions where role = 'manager' loop
    insert into role_module_permissions (org_id, role, module_key, can_view)
    values (org.org_id, 'manager', 'manager-notifications', true)
    on conflict (org_id, role, module_key) do update set can_view = true;
  end loop;
end $$;
