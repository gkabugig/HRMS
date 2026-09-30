-- role_module_permissions already has rows for every existing org, so each
-- new Phase 3 nav entry needs its own seed row per role/org or it silently
-- never shows (dashboard/layout.tsx only falls back to
-- DEFAULT_VISIBLE_MODULES when an org has zero permission rows at all).
--
-- Visibility choices:
--  - analytics: Workforce Analytics is "Executive and HR visibility" per
--    the spec's own capability table -> admin/hr only.
--  - payroll-anomalies: payroll-sensitive, same visibility as Payroll
--    itself for HR-like roles -> admin/hr only.
--  - performance-insights: admin/hr see the org; manager is included too
--    because RLS (ai_insights_manager_read) already scopes what a manager
--    can see to their own reports' performance insights only.

insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role, m.module_key, true
from organizations o
cross join (values ('admin'::user_role), ('hr'::user_role)) as r(role)
cross join (values ('analytics'), ('payroll-anomalies')) as m(module_key)
on conflict (org_id, role, module_key) do nothing;

insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role, 'performance-insights', true
from organizations o
cross join (values ('admin'::user_role), ('hr'::user_role), ('manager'::user_role)) as r(role)
on conflict (org_id, role, module_key) do nothing;
