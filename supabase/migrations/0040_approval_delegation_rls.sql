-- Universal Approval Engine — RLS for delegated decisions.
--
-- 0039 wired delegation columns and a resource column onto the existing
-- approval_delegations table, but a delegate still had no actual way to
-- decide a step: approval_steps_approver_decide only matches
-- approver_user_id = auth.uid(), so a delegate acting on someone else's
-- named step was rejected by RLS before application code (isValidDelegate
-- in decide-approval-step.ts) ever ran. A new migration rather than
-- editing 0039 in place, per the same "don't rewrite an applied migration"
-- convention Area 01's 0037 followed.
--
-- Additive PERMISSIVE policy — it can only broaden who may decide a step,
-- never narrow the existing policies.
create policy "approval_steps_delegate_decide" on public.approval_steps
  as permissive for update to authenticated
  using (
    approver_user_id is not null
    and exists (
      select 1
      from public.approval_delegations d
      join public.approval_requests r on r.id = approval_steps.approval_request_id
      where d.delegator_user_id = approval_steps.approver_user_id
        and d.delegate_user_id = auth.uid()
        and now() between d.starts_at and d.ends_at
        and (d.resource is null or d.resource = r.request_type)
        and r.org_id = current_org_id()
    )
  )
  with check (
    approver_user_id is not null
    and exists (
      select 1
      from public.approval_delegations d
      join public.approval_requests r on r.id = approval_steps.approval_request_id
      where d.delegator_user_id = approval_steps.approver_user_id
        and d.delegate_user_id = auth.uid()
        and now() between d.starts_at and d.ends_at
        and (d.resource is null or d.resource = r.request_type)
        and r.org_id = current_org_id()
    )
  );
