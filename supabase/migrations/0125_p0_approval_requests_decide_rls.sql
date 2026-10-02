-- P0 SECURITY HARDENING (SEC-007/SEC-008 correctness half): approval_requests
-- has never had an UPDATE policy for anyone other than admin/hr
-- (approval_requests_hr_full) or the requester withdrawing their own
-- pending request (approval_requests_requester_withdraw, 0065). Every
-- decideApprovalStep() call site (src/app/dashboard/approvals/actions.ts,
-- src/lib/attendance/request-correction-actions.ts,
-- src/lib/self-service/profile-change-actions.ts,
-- src/lib/compensation/change-request-actions.ts,
-- src/lib/positions/{workforce-plan,position-request}-actions.ts,
-- src/lib/documents/lifecycle.ts) runs on the deciding user's own
-- session-scoped client (createClient()), never the admin client. So when a
-- named approver, a role-matched approver (manager/hr-role step), or a
-- valid delegate - anyone who isn't literally 'admin' or 'hr' - decides a
-- step, decide-approval-step.ts's own UPDATE on approval_requests (setting
-- status to approved/rejected/returned, or advancing current_step) is
-- silently dropped by RLS: the client reports no error (an UPDATE that
-- matches zero rows isn't a Postgres error), but the request is left stuck
-- on 'pending_approval' forever even though the step itself recorded a
-- decision. This is a correctness/approval-integrity gap (spec SEC-007/
-- SEC-008: "approval state must reflect reality"), not an isolated typo -
-- it affects every non-admin/hr decision path in the app.
--
-- Fix: a narrowly-scoped additional PERMISSIVE policy granting UPDATE only
-- to a caller who is an actual participant in this request's approval
-- chain (named approver, role-matched approver, or currently-valid
-- delegate of either) on AT LEAST ONE step of the request - deliberately
-- not restricted to the currently-pending step, since the second and third
-- UPDATEs in decide-approval-step.ts (advancing current_step, stamping
-- started_at on the next step) happen immediately after the caller's own
-- step has already flipped out of 'pending'. This does not reopen the
-- "can't approve your own request" or self-decision boundary - those are
-- unrelated per-step checks (approval_steps_approver_decide/_role_decide/
-- _delegate_decide) that still gate whether the step itself can be
-- decided; this policy only lets a legitimate step participant also update
-- the parent request's rollup status once they have.
--
-- No separate WITH CHECK: for a plain "for update" policy (not "for all"),
-- Postgres still falls back to the USING clause as the implicit WITH CHECK
-- when none is given, matching the convention already used throughout this
-- migration set (0025, 0124).
create policy "approval_requests_approver_decide" on approval_requests
  for update using (
    exists (
      select 1 from approval_steps s
      where s.approval_request_id = id
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
