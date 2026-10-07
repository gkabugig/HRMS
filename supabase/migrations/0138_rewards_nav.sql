-- Rewards & Merit menu items. role_module_permissions is an explicit
-- allow-list per org/role, so organisations that already have rows need the
-- new keys added or nobody sees them (same situation as 0120 and 0131).
insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role::user_role, 'rewards', true
from organizations o
cross join (values ('admin'), ('hr'), ('manager')) as r(role)
where exists (select 1 from role_module_permissions rmp where rmp.org_id = o.id)
on conflict (org_id, role, module_key) do nothing;

insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, 'employee'::user_role, 'me-rewards', true
from organizations o
where exists (select 1 from role_module_permissions rmp where rmp.org_id = o.id)
on conflict (org_id, role, module_key) do nothing;
