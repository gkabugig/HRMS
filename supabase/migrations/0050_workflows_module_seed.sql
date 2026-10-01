-- Same gap 0027 fixed for "approvals": role_module_permissions already has
-- rows for every existing org, so the new "workflows" nav entry (the
-- read-only catalogue + run-detail UI) needs its own seed row per role/org
-- or it silently never shows. Admin/hr only — the audience this scope's
-- UI is built for (workflow_run_nodes RLS gives them the full run-detail
-- view; a submitting employee can still read their own run's rows via
-- workflow_run_nodes_requester_read, but has no nav entry to it here).
insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role, 'workflows', true
from organizations o
cross join (values ('admin'::user_role), ('hr'::user_role)) as r(role)
on conflict (org_id, role, module_key) do nothing;
