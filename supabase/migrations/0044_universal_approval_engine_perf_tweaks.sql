-- Universal Approval Engine — covering indexes for the foreign keys this
-- Area 02 work added (0039/0043), flagged by the performance advisor as
-- unindexed. Same housekeeping Area 01 did for its own new columns in
-- 0038. Every index here backs a query this engine actually runs: the
-- detail page's step/escalation lookups, and delegation-aware step
-- reassignment.
create index if not exists idx_approval_requests_definition on public.approval_requests(definition_id);
create index if not exists idx_approval_steps_definition_step on public.approval_steps(definition_step_id);
create index if not exists idx_approval_steps_delegated_from on public.approval_steps(delegated_from);
create index if not exists idx_approval_steps_delegated_to on public.approval_steps(delegated_to);
create index if not exists idx_approval_escalations_from_approver on public.approval_escalations(from_approver_id);
create index if not exists idx_approval_escalations_to_approver on public.approval_escalations(to_approver_id);
create index if not exists idx_approval_escalations_step on public.approval_escalations(step_id);

-- The cron route and the "overdue" tab both filter approval_steps by
-- (status = 'pending' and due_at < now()) — a partial index on exactly
-- that predicate keeps the scan small as the table grows, instead of
-- scanning every step every time the escalation job runs.
create index if not exists idx_approval_steps_pending_due on public.approval_steps(due_at) where status = 'pending';
