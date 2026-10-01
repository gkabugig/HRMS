-- Grant the new notifications-admin module key to admin and hr for every
-- org that already has role_module_permissions rows for those roles.
do $$
declare
  org record;
begin
  for org in select distinct org_id, role from role_module_permissions where role in ('admin','hr') loop
    insert into role_module_permissions (org_id, role, module_key, can_view)
    values (org.org_id, org.role, 'notifications-admin', true)
    on conflict (org_id, role, module_key) do update set can_view = true;
  end loop;
end $$;
