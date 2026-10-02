-- P0 SECURITY HARDENING (SEC-007): approval_actions_actor_insert (0023) only
-- checks "actor_user_id = auth.uid()" - it never checks that the request
-- being referenced is even in the caller's own organisation, nor that the
-- caller is actually entitled to act on it. Any authenticated user can
-- currently insert a fabricated approval_actions row (e.g. action='approve')
-- against ANY approval_request_id in ANY organisation, as long as they claim
-- to be the actor. approval_actions is the immutable decision trail the
-- audit/compliance surface relies on (spec §10.1 "append-only log of every
-- action taken on a request") and is also read back by the UI timeline, so a
-- forged row is both a cross-tenant integrity breach and a believable fake
-- "this was approved" audit entry.
--
-- Fix: require the row to be one of the two shapes the app itself ever
-- produces (src/lib/approvals/create-approval-request.ts,
-- src/lib/approvals/decide-approval-step.ts):
--   1. action='submit' by the request's own requester (opening it) - no
--      step_id yet exists at that point.
--   2. a decision (approve/reject/return) tied to a real step_id the actor
--      is actually entitled to decide - named approver, role-matched
--      approver, their valid delegate, or admin/hr - mirroring the exact
--      same entitlement the approval_steps update policies
--      (approver_decide/role_decide/delegate_decide/hr_full) already
--      enforce for deciding the step itself.
-- Both shapes are additionally scoped to the caller's own organisation via
-- approval_request_org_id() (the recursion-safe helper 0045 introduced),
-- closing the cross-tenant forgery gap outright rather than just the
-- role check.
drop policy "approval_actions_actor_insert" on approval_actions;
create policy "approval_actions_actor_insert" on approval_actions
  for insert with check (
    actor_user_id = auth.uid()
    and approval_request_org_id(approval_request_id) = current_org_id()
    and (
      (
        step_id is null
        and action = 'submit'
        and approval_request_requested_by(approval_request_id) = auth.uid()
      )
      or (
        step_id is not null
        and exists (
          select 1 from approval_steps s
          where s.id = step_id
            and s.approval_request_id = approval_actions.approval_request_id
            and (
              s.approver_user_id = auth.uid()
              or (s.approver_role is not null and hrms_current_role() = s.approver_role)
              or hrms_current_role() in ('admin','hr')
              or exists (
                select 1 from approval_delegations d
                where d.delegator_user_id = s.approver_user_id
                  and d.delegate_user_id = auth.uid()
                  and now() between d.starts_at and d.ends_at
              )
            )
        )
      )
    )
  );
