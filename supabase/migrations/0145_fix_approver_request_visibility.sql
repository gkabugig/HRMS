-- Fix: a named approver (for example the head of organisation signing a large
-- reward) could see their approval step but not the request behind it, so their
-- Approvals inbox showed a blank row and they could not decide it.
--
-- Cause: the two approver policies on approval_requests wrote
-- "s.approval_request_id = id". Inside that sub-query the bare "id" means
-- approval_steps.id, not approval_requests.id, so the test never matched.
-- Here "id" is written as approval_requests.id. Role-matched approvers and
-- current delegates are covered too.

drop policy if exists "approval_requests_approver_read" on approval_requests;
create policy "approval_requests_approver_read" on approval_requests
  for select using (
    exists (
      select 1 from approval_steps s
      where s.approval_request_id = approval_requests.id
        and (
          s.approver_user_id = auth.uid()
          or (s.approver_role is not null and hrms_current_role() = s.approver_role and approval_requests.org_id = current_org_id())
          or exists (
            select 1 from approval_delegations d
            where d.delegator_user_id = s.approver_user_id
              and d.delegate_user_id = auth.uid()
              and now() between d.starts_at and d.ends_at
              and (d.resource is null or d.resource = approval_requests.request_type)
          )
        )
    )
  );

drop policy if exists "approval_requests_approver_decide" on approval_requests;
create policy "approval_requests_approver_decide" on approval_requests
  for update using (
    exists (
      select 1 from approval_steps s
      where s.approval_request_id = approval_requests.id
        and (
          s.approver_user_id = auth.uid()
          or (s.approver_role is not null and hrms_current_role() = s.approver_role)
          or exists (
            select 1 from approval_delegations d
            where d.delegator_user_id = s.approver_user_id
              and d.delegate_user_id = auth.uid()
              and now() between d.starts_at and d.ends_at
              and (d.resource is null or d.resource = approval_requests.request_type)
          )
        )
    )
  );
