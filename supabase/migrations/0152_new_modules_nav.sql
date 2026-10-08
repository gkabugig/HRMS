-- Menu items for noticeboard, timesheets, succession, surveys and wellbeing.
-- role_module_permissions is an explicit allow-list per organisation and role,
-- so organisations that already have rows need the new keys added.
insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role::user_role, r.module_key, true
from organizations o
cross join (values
  ('admin','announcements'),('hr','announcements'),('manager','announcements'),('employee','announcements'),
  ('admin','timesheets'),('hr','timesheets'),('manager','timesheets'),('employee','me-timesheets'),
  ('admin','succession'),('hr','succession'),
  ('admin','surveys'),('hr','surveys'),('employee','me-surveys'),('manager','me-surveys'),('manager','me-timesheets'),
  ('admin','wellbeing'),('hr','wellbeing'),('employee','me-wellbeing'),('manager','me-wellbeing')
) as r(role, module_key)
where exists (select 1 from role_module_permissions rmp where rmp.org_id = o.id)
on conflict (org_id, role, module_key) do nothing;
