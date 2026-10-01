-- Found while running live acceptance tests for Task #24: a manager (or
-- any non-hr/admin role) assigned a role-matched step, and a delegate
-- standing in for someone else's named step, could never actually decide
-- it — approval_steps_role_decide and approval_steps_delegate_decide are
-- UPDATE-only policies, but Postgres's row-security for UPDATE requires a
-- row to satisfy BOTH the UPDATE-applicable policies (OR'd) AND the
-- SELECT-applicable policies (OR'd) — confirmed via EXPLAIN ANALYZE, which
-- showed delegate_decide's own EXISTS condition passing (SubPlan 2 returned
-- true) and the row still being thrown out ("Rows Removed by Filter: 1")
-- because no SELECT policy covers a delegate. hr-role steps happened to
-- work anyway only because approval_steps_hr_full is a FOR ALL policy that
-- already covers admin/hr on both SELECT and UPDATE — the gap only shows
-- up for a role other than admin/hr, or for any delegate at all.
create policy "approval_steps_role_read" on public.approval_steps
  for select to authenticated
  using (
    approver_role is not null
    and hrms_current_role() = approver_role
    and approval_request_org_id(approval_request_id) = current_org_id()
  );

create policy "approval_steps_delegate_read" on public.approval_steps
  for select to authenticated
  using (
    approver_user_id is not null
    and exists (
      select 1 from public.approval_delegations d
      where d.delegator_user_id = approval_steps.approver_user_id
        and d.delegate_user_id = auth.uid()
        and now() between d.starts_at and d.ends_at
        and (d.resource is null or d.resource = approval_request_type(approval_steps.approval_request_id))
        and approval_request_org_id(approval_steps.approval_request_id) = current_org_id()
    )
  );
