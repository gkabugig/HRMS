-- role_module_permissions already has rows for every existing org (0014),
-- so the new "approvals" nav entry needs its own seed row per role/org or
-- it silently never shows (dashboard/layout.tsx only falls back to
-- DEFAULT_VISIBLE_MODULES when an org has zero permission rows at all).
-- Visible to admin/hr/manager (the roles that can be an approver today),
-- not employee (who submits requests, doesn't decide them).
insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role, 'approvals', true
from organizations o
cross join (values ('admin'::user_role), ('hr'::user_role), ('manager'::user_role)) as r(role)
on conflict (org_id, role, module_key) do nothing;
