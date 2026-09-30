insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role, 'service-requests', true
from organizations o
cross join (values ('admin'::user_role), ('hr'::user_role), ('manager'::user_role), ('employee'::user_role)) as r(role)
on conflict (org_id, role, module_key) do nothing;
