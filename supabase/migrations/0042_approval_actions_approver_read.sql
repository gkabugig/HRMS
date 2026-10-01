-- Universal Approval Engine — Approvals Centre detail page (Task #23).
--
-- approval_actions_participant_read only covers the acting user and the
-- original requester — a named approver who hasn't decided yet (or a valid
-- delegate standing in for them) had no RLS path to read the request's
-- prior decision history, so the new per-request timeline view would come
-- back empty for exactly the people who most need to see it before they
-- decide. Additive PERMISSIVE policy, same shape as approval_steps_
-- role_decide/_delegate_decide: it can only broaden read access, never
-- narrow it.
create policy "approval_actions_approver_read" on public.approval_actions
  for select to authenticated
  using (
    exists (
      select 1 from public.approval_steps s
      where s.approval_request_id = approval_actions.approval_request_id
        and (
          s.approver_user_id = auth.uid()
          or (
            s.approver_user_id is not null
            and exists (
              select 1 from public.approval_delegations d
              join public.approval_requests r on r.id = approval_actions.approval_request_id
              where d.delegator_user_id = s.approver_user_id
                and d.delegate_user_id = auth.uid()
                and d.org_id = r.org_id
                and now() between d.starts_at and d.ends_at
                and (d.resource is null or d.resource = r.request_type)
            )
          )
        )
    )
  );
