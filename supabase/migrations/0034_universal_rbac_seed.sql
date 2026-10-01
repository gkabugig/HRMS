-- Universal RBAC — seed the permission catalogue, map the four existing
-- system roles into rbac_role_permissions (mirroring today's *effective*
-- access exactly, so turning enforcement on in 0035 is not a behaviour
-- change), and backfill rbac_user_roles for every app_user that existed
-- before the sync trigger in 0033 started firing (the trigger only
-- catches inserts/updates from this point forward).

-- 1. Permission catalogue (global, not org-scoped).
insert into public.rbac_permissions (resource, action, sensitivity, description)
select v.resource, v.action::public.rbac_action, v.sensitivity::public.rbac_sensitivity, v.description
from (values
  ('employees', 'view', 'normal', 'View employee records'),
  ('employees', 'view', 'confidential', 'View confidential employee data'),
  ('employees', 'edit', 'normal', 'Edit employee records'),
  ('employees', 'edit', 'highly_restricted', 'Edit highly restricted employee data'),
  ('employees', 'create', 'normal', 'Create employees'),
  ('employees', 'delete', 'normal', 'Delete/archive employee records'),
  ('employees', 'export', 'confidential', 'Export employee data'),
  ('payroll', 'view', 'normal', 'View payroll summaries'),
  ('payroll', 'view', 'highly_restricted', 'View detailed payroll data'),
  ('payroll', 'edit', 'highly_restricted', 'Edit payroll inputs'),
  ('payroll', 'approve', 'highly_restricted', 'Approve payroll'),
  ('payroll', 'export', 'highly_restricted', 'Export payroll data'),
  ('leave', 'view', 'normal', 'View leave'),
  ('leave', 'create', 'normal', 'Create leave requests'),
  ('leave', 'edit', 'normal', 'Edit leave'),
  ('leave', 'approve', 'normal', 'Approve leave'),
  ('attendance', 'view', 'normal', 'View attendance'),
  ('attendance', 'edit', 'normal', 'Correct attendance'),
  ('performance', 'view', 'confidential', 'View performance records'),
  ('performance', 'edit', 'confidential', 'Edit performance records'),
  ('performance', 'approve', 'confidential', 'Approve performance'),
  ('documents', 'view', 'confidential', 'View employee documents'),
  ('documents', 'edit', 'confidential', 'Manage employee documents'),
  ('documents', 'export', 'confidential', 'Export documents'),
  ('recruitment', 'view', 'confidential', 'View recruitment'),
  ('recruitment', 'edit', 'confidential', 'Manage recruitment'),
  ('recruitment', 'approve', 'confidential', 'Approve recruitment'),
  ('service_requests', 'view', 'normal', 'View HR service requests'),
  ('service_requests', 'edit', 'normal', 'Manage HR service requests'),
  ('audit', 'view', 'highly_restricted', 'View audit events'),
  ('settings', 'manage', 'highly_restricted', 'Manage system settings'),
  ('rbac', 'manage', 'highly_restricted', 'Manage roles and permissions')
) as v(resource, action, sensitivity, description)
on conflict (resource, action, sensitivity) do nothing;

-- 2. System roles for every existing org (the sync trigger only creates
-- these going forward; orgs that already existed before 0033 need them
-- created explicitly).
insert into public.rbac_roles (org_id, code, name, description, is_system)
select o.id, v.code, v.name, v.description, true
from public.organizations o
cross join (values
  ('admin', 'Administrator', 'Full HRMS administration'),
  ('hr', 'HR', 'Human resources operations'),
  ('manager', 'Manager', 'People manager access'),
  ('employee', 'Employee', 'Self-service access')
) as v(code, name, description)
on conflict (org_id, code) do nothing;

-- 3. Backfill rbac_user_roles for app_users that existed before the sync
-- trigger started firing.
insert into public.rbac_user_roles (user_id, org_id, role_id)
select au.id, au.org_id, r.id
from public.app_users au
join public.rbac_roles r on r.org_id = au.org_id and r.code = au.role::text
on conflict (user_id, org_id, role_id) do nothing;

-- 4. Role -> permission -> scope grants. This mirrors the *current*
-- effective access of each legacy role exactly (cross-checked against the
-- live RLS policies on employees/employee_documents/payslips and the
-- existing role-based `if (role !== 'admin' && role !== 'hr')` guards
-- elsewhere), so flipping on enforcement in the next migration changes
-- nothing until an admin actually edits a grant from the new Roles &
-- Access screen.
insert into public.rbac_role_permissions (role_id, permission_id, scope)
select r.id, p.id, v.scope::public.rbac_scope
from (values
  -- Admin: full organisation-wide access across every catalogued resource.
  ('admin','employees','view','normal','organisation'),
  ('admin','employees','view','confidential','organisation'),
  ('admin','employees','edit','normal','organisation'),
  ('admin','employees','edit','highly_restricted','organisation'),
  ('admin','employees','create','normal','organisation'),
  ('admin','employees','delete','normal','organisation'),
  ('admin','employees','export','confidential','organisation'),
  ('admin','payroll','view','normal','organisation'),
  ('admin','payroll','view','highly_restricted','organisation'),
  ('admin','payroll','edit','highly_restricted','organisation'),
  ('admin','payroll','approve','highly_restricted','organisation'),
  ('admin','payroll','export','highly_restricted','organisation'),
  ('admin','leave','view','normal','organisation'),
  ('admin','leave','create','normal','organisation'),
  ('admin','leave','edit','normal','organisation'),
  ('admin','leave','approve','normal','organisation'),
  ('admin','attendance','view','normal','organisation'),
  ('admin','attendance','edit','normal','organisation'),
  ('admin','performance','view','confidential','organisation'),
  ('admin','performance','edit','confidential','organisation'),
  ('admin','performance','approve','confidential','organisation'),
  ('admin','documents','view','confidential','organisation'),
  ('admin','documents','edit','confidential','organisation'),
  ('admin','documents','export','confidential','organisation'),
  ('admin','recruitment','view','confidential','organisation'),
  ('admin','recruitment','edit','confidential','organisation'),
  ('admin','recruitment','approve','confidential','organisation'),
  ('admin','service_requests','view','normal','organisation'),
  ('admin','service_requests','edit','normal','organisation'),
  ('admin','audit','view','highly_restricted','organisation'),
  ('admin','settings','manage','highly_restricted','organisation'),
  ('admin','rbac','manage','highly_restricted','organisation'),

  -- HR: same operational access as admin, minus RBAC administration
  -- itself (nobody should be able to grant themselves more access through
  -- the very screen that controls access).
  ('hr','employees','view','normal','organisation'),
  ('hr','employees','view','confidential','organisation'),
  ('hr','employees','edit','normal','organisation'),
  ('hr','employees','edit','highly_restricted','organisation'),
  ('hr','employees','create','normal','organisation'),
  ('hr','employees','delete','normal','organisation'),
  ('hr','employees','export','confidential','organisation'),
  ('hr','payroll','view','normal','organisation'),
  ('hr','payroll','view','highly_restricted','organisation'),
  ('hr','payroll','edit','highly_restricted','organisation'),
  ('hr','payroll','approve','highly_restricted','organisation'),
  ('hr','payroll','export','highly_restricted','organisation'),
  ('hr','leave','view','normal','organisation'),
  ('hr','leave','create','normal','organisation'),
  ('hr','leave','edit','normal','organisation'),
  ('hr','leave','approve','normal','organisation'),
  ('hr','attendance','view','normal','organisation'),
  ('hr','attendance','edit','normal','organisation'),
  ('hr','performance','view','confidential','organisation'),
  ('hr','performance','edit','confidential','organisation'),
  ('hr','performance','approve','confidential','organisation'),
  ('hr','documents','view','confidential','organisation'),
  ('hr','documents','edit','confidential','organisation'),
  ('hr','documents','export','confidential','organisation'),
  ('hr','recruitment','view','confidential','organisation'),
  ('hr','recruitment','edit','confidential','organisation'),
  ('hr','recruitment','approve','confidential','organisation'),
  ('hr','service_requests','view','normal','organisation'),
  ('hr','service_requests','edit','normal','organisation'),
  ('hr','audit','view','highly_restricted','organisation'),
  ('hr','settings','manage','highly_restricted','organisation'),

  -- Manager: own record (self) + direct reports, matches
  -- employees_manager_reads_reports / is_manager_of()-gated policies.
  ('manager','employees','view','normal','self'),
  ('manager','employees','view','normal','direct_reports'),
  ('manager','leave','view','normal','direct_reports'),
  ('manager','leave','approve','normal','direct_reports'),
  ('manager','leave','view','normal','self'),
  ('manager','leave','create','normal','self'),
  ('manager','attendance','view','normal','direct_reports'),
  ('manager','attendance','view','normal','self'),
  ('manager','performance','view','confidential','direct_reports'),
  ('manager','performance','edit','confidential','direct_reports'),
  ('manager','documents','view','confidential','direct_reports'),
  ('manager','documents','view','confidential','self'),
  ('manager','service_requests','view','normal','direct_reports'),
  ('manager','service_requests','view','normal','self'),
  ('manager','service_requests','edit','normal','self'),
  ('manager','payroll','view','normal','self'),

  -- Employee: self-service only, matches employees_self_read/_update and
  -- payslips_self_read.
  ('employee','employees','view','normal','self'),
  ('employee','employees','edit','normal','self'),
  ('employee','leave','view','normal','self'),
  ('employee','leave','create','normal','self'),
  ('employee','leave','edit','normal','self'),
  ('employee','attendance','view','normal','self'),
  ('employee','documents','view','confidential','self'),
  ('employee','service_requests','view','normal','self'),
  ('employee','service_requests','edit','normal','self'),
  ('employee','payroll','view','normal','self')
) as v(role_code, resource, action, sensitivity, scope)
join public.rbac_roles r on r.code = v.role_code
join public.rbac_permissions p
  on p.resource = v.resource
 and p.action = v.action::public.rbac_action
 and p.sensitivity = v.sensitivity::public.rbac_sensitivity
on conflict (role_id, permission_id, scope) do nothing;
