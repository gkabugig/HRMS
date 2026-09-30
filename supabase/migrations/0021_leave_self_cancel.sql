-- Employee self-service: cancel a leave request that is still Pending
-- (spec §6/§25 "Allow employee to cancel a pending request where policy
-- permits"). No existing policy let a non-admin/hr/manager touch their own
-- leave_requests row beyond inserting it.
create policy "leave_self_cancel_pending" on leave_requests
  for delete using (employee_id = current_employee_id() and status = 'Pending');
