-- Area 06 §17 "Team Requests" — managers need a scoped view of HR service
-- requests involving their team. Found during inspection: the manager role
-- already holds a 'service_requests'/'view'/'normal'/'direct_reports' grant
-- in rbac_role_permissions (Area 01 seed), but service_requests itself has
-- no PERMISSIVE RLS policy implementing it at all — only
-- service_requests_hr_full (admin/hr) and service_requests_self_read
-- (employee_id = current_employee_id()) exist. A manager querying
-- service_requests for their team today gets zero rows regardless of the
-- RBAC grant — the same "RBAC permission exists but RLS was never wired up
-- for it" bug class found in Areas 04/05, this time a missing PERMISSIVE
-- grant rather than a missing/misdirected RESTRICTIVE one.
--
-- This schema has no per-request-type visibility flag (no
-- service_request_catalogue/category table to distinguish "General HR
-- query" from "Payroll query" from "Sensitive personal data change" per
-- spec §17's table) — scoping by direct-reports membership is the
-- precision this schema actually supports today; finer type-based
-- filtering would need new catalogue metadata, out of scope for this pass.
create policy "service_requests_manager_team_read" on service_requests
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));
