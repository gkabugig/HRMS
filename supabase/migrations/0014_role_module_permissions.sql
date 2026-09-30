-- Module-level permissions: which sidebar/nav modules each role can see.
-- This is a UI-visibility layer on top of the existing 4-role RLS model,
-- not a replacement for it — every table's actual data access is still
-- governed by hrms_current_role() checks in 0002_rls.sql and later. Turning
-- a module off here hides it from that role's nav; it does not by itself
-- grant or revoke data access (an admin/hr policy on the underlying table
-- still applies regardless of what's toggled here).

create table role_module_permissions (
  org_id uuid not null references organizations(id),
  role user_role not null,
  module_key text not null,
  can_view boolean not null default true,
  primary key (org_id, role, module_key)
);

alter table role_module_permissions enable row level security;

create policy "role_permissions_hr_full" on role_module_permissions
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- Every signed-in org member needs to read their own role's row set to
-- build their sidebar.
create policy "role_permissions_read_all" on role_module_permissions
  for select using (org_id = current_org_id());

-- Seed defaults matching the nav as it stands today (lib/auth/roles.ts),
-- so turning this feature on doesn't silently hide anything. HR/admin can
-- then narrow from here in Settings.
insert into role_module_permissions (org_id, role, module_key, can_view)
select '00000000-0000-0000-0000-000000000001', r.role, m.module_key, true
from (values ('admin'::user_role), ('hr'::user_role), ('manager'::user_role), ('employee'::user_role)) as r(role)
cross join (values
  ('dashboard'),('employees'),('recruitment'),('attendance'),('leave'),('payroll'),
  ('performance'),('ld'),('compliance'),('disciplinary'),('offboarding'),('reports'),
  ('settings'),('organogram'),('documents'),('branches'),('shifts'),('assignments'),('audit-log')
) as m(module_key)
on conflict (org_id, role, module_key) do nothing;

-- Narrow the seed to what each role actually saw before this migration
-- (mirrors TABS_BY_ROLE in lib/auth/roles.ts at the time this was written),
-- plus sensible defaults for the new modules this same batch introduces:
-- organogram/branches/shifts/audit-log stay HR/admin-only, documents is
-- HR/admin + the employee's own (no manager access, personal documents),
-- assignments stays open to all four (HR/admin full, manager assigns their
-- team, employee sees/updates their own).
update role_module_permissions set can_view = false
where role = 'hr' and module_key in ('settings');

update role_module_permissions set can_view = false
where role = 'manager' and module_key in (
  'employees','recruitment','payroll','ld','compliance','offboarding','reports',
  'settings','branches','shifts','organogram','documents','audit-log'
);
update role_module_permissions set can_view = false
where role = 'employee' and module_key in (
  'employees','recruitment','attendance','ld','compliance','disciplinary','offboarding',
  'reports','settings','organogram','branches','shifts','audit-log'
);
