-- Help Centre menu item for admin, HR and managers. role_module_permissions
-- is an explicit allow-list per org/role, so orgs that already have rows
-- need the new "help" key added or nobody sees it (same situation as 0120).
-- Employees keep their own Help page (me-help).
insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role::user_role, 'help', true
from organizations o
cross join (values ('admin'), ('hr'), ('manager')) as r(role)
where exists (select 1 from role_module_permissions rmp where rmp.org_id = o.id)
on conflict (org_id, role, module_key) do nothing;
