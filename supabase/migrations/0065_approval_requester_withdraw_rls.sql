-- Area 05 needs a self-service requester to be able to withdraw their own
-- still-pending approval request (e.g. an attendance correction request the
-- employee no longer wants reviewed) — confirmed via inspection that NO
-- existing RLS policy lets the requester update approval_requests/
-- approval_steps at all (only select/insert; update is reserved for the
-- named approver/role/delegate/hr, correctly, since that's the
-- "self-approval denied" boundary). Withdrawing your own request is not
-- approving it, so this adds a narrowly-scoped additional PERMISSIVE policy
-- for exactly that one transition (pending -> returned, requester only),
-- not a weakening of the approve/reject boundary.
create policy "approval_requests_requester_withdraw" on approval_requests
  for update using (requested_by = auth.uid() and status = 'pending_approval')
  with check (requested_by = auth.uid() and status = 'returned');

create policy "approval_steps_requester_withdraw" on approval_steps
  for update using (approval_request_requested_by(approval_request_id) = auth.uid() and status = 'pending')
  with check (approval_request_requested_by(approval_request_id) = auth.uid() and status = 'returned');
