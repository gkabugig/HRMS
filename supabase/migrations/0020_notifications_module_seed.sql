-- The role_module_permissions table already has rows for every existing
-- org (see 0014), so the new "notifications" nav entry added for this
-- build needs its own seed row per role/org or it silently never shows
-- (dashboard/layout.tsx only falls back to DEFAULT_VISIBLE_MODULES when an
-- org has zero permission rows at all). Visible to every role by default,
-- matching how every role gets a notification centre in the spec.
insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role, 'notifications', true
from organizations o
cross join (values ('admin'::user_role), ('hr'::user_role), ('manager'::user_role), ('employee'::user_role)) as r(role)
on conflict (org_id, role, module_key) do nothing;
