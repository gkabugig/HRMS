-- Performance-advisor finding: position_requests_requester_read
-- re-evaluated auth.uid() per row. ALTER POLICY in place (DROP POLICY is
-- silently cancelled by the migration tool in this environment).
alter policy position_requests_requester_read on position_requests
  using (requested_by = current_employee_id() or requested_by = (select auth.uid()));
