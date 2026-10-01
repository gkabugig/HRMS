-- CRITICAL FIX — pre-existing bug, found while verifying Area 02, unrelated
-- to any Area 02 feature itself: approval_steps and approval_requests have
-- RLS policies that reference each other directly (approval_steps_hr_full/
-- _requester_read/_role_decide/_delegate_decide each subquery
-- approval_requests for an org/requester/resource check, while
-- approval_requests_approver_read subqueries approval_steps right back) —
-- a genuine two-table RLS cycle. Postgres has to apply each table's RLS
-- while evaluating the other's policy, which recurses forever and fails
-- with "42P17: infinite recursion detected in policy for relation
-- approval_steps". Confirmed live: even a plain `select count(*) from
-- approval_steps` as the real admin account fails this way today — the
-- Approvals Centre has been broken for admin/hr (and any query that
-- reaches approval_steps_hr_full's org-check branch) since migration 0025
-- added that branch, well before this Area 02 work. Proven NOT to be
-- something Area 02 introduced: the same query still recurses with
-- approval_steps_role_decide/_delegate_decide (this session's own new
-- policies) dropped entirely.
--
-- Fix: the same pattern hrms_current_role()/current_org_id()/
-- current_employee_id() already use for app_users — a SECURITY DEFINER
-- function that reads the other table bypassing its RLS, so evaluating
-- approval_steps' policies never re-triggers approval_requests' RLS (and
-- therefore never loops back into approval_steps'). One-directional lookups
-- elsewhere (approval_actions/approval_escalations -> approval_requests or
-- approval_steps) aren't touched — they're not part of any cycle, since
-- neither approval_steps nor approval_requests references them back.
create or replace function public.approval_request_org_id(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.approval_requests where id = p_request_id;
$$;

create or replace function public.approval_request_requested_by(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select requested_by from public.approval_requests where id = p_request_id;
$$;

create or replace function public.approval_request_type(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select request_type from public.approval_requests where id = p_request_id;
$$;

drop policy "approval_steps_hr_full" on public.approval_steps;
create policy "approval_steps_hr_full" on public.approval_steps
  for all using (
    hrms_current_role() in ('admin', 'hr')
    and approval_request_org_id(approval_request_id) = current_org_id()
  );

drop policy "approval_steps_requester_read" on public.approval_steps;
create policy "approval_steps_requester_read" on public.approval_steps
  for select using (approval_request_requested_by(approval_request_id) = auth.uid());

drop policy "approval_steps_role_decide" on public.approval_steps;
create policy "approval_steps_role_decide" on public.approval_steps
  for update to authenticated
  using (
    approver_role is not null
    and hrms_current_role() = approver_role
    and approval_request_org_id(approval_request_id) = current_org_id()
  )
  with check (
    approver_role is not null
    and hrms_current_role() = approver_role
    and approval_request_org_id(approval_request_id) = current_org_id()
  );

drop policy "approval_steps_delegate_decide" on public.approval_steps;
create policy "approval_steps_delegate_decide" on public.approval_steps
  for update to authenticated
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
  )
  with check (
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
