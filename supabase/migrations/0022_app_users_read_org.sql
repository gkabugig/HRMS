-- The notification engine needs to resolve "who is HR/admin" and "who is
-- this employee's manager" (as app_users ids) from whichever session
-- triggered the notification — which is very often a plain employee
-- submitting leave, not an admin. app_users previously only let a user
-- read their own row (or every row, if admin), so that resolution silently
-- returned nothing and no one ever got notified about an employee-
-- initiated event.
--
-- This adds read access to the rest of one's own org's app_users rows.
-- The exposed columns are id/org_id/role/employee_id only (no email,
-- password, or other credential lives on this table) — effectively "who
-- has which role and which login maps to which employee", which every
-- role can already infer indirectly from the Employees list and Settings'
-- role/permission matrix. It does not widen what any role can DO (every
-- other table's own policies are unchanged), only what this one directory
-- table can be read for.
create policy "app_users_read_org" on app_users
  for select using (org_id = current_org_id());
