-- CRITICAL FIX — found while live-testing Area 03's submission path as a
-- plain "employee" role (not admin/hr): neither approval_requests nor
-- approval_steps has ever had an INSERT policy for a regular requester —
-- only "*_hr_full" (ALL, admin/hr only) covers insert. createApprovalRequest()
-- runs with the CALLING user's own RLS-scoped client (never the service-role
-- client), so startApproval() — and therefore submitProfileChangeRequest()
-- itself — has been silently broken for any non-admin/hr submitter since
-- Area 02 shipped: the very first insert in createApprovalRequest() would be
-- rejected by RLS before a single approval_steps row could be written. This
-- predates Area 03 and is not something this pass introduced, but Area 03's
-- rewire is what actually exercises the self-service path as a plain
-- employee for the first time in live testing, so this is the first point
-- it was caught.
--
-- Matching gap in the new Area 03 tables: workflow_runs and
-- workflow_run_nodes also only had "*_hr_full" (ALL) — startWorkflowFromEvent
-- and executeNode insert/update both tables with the SAME caller's client
-- that submitted the request (an employee), not an admin client, so the
-- Employee Data Change workflow run itself would fail to even start for a
-- real employee without these.
--
-- INSERT-only policies here are deliberately org-scoped rather than
-- ownership-scoped (unlike the SELECT policies): Postgres's INSERT check is
-- WITH CHECK only, with no equivalent to the UPDATE "must also satisfy a
-- SELECT policy" gate, so there's no cheap way to additionally require "this
-- entity_id is actually yours" from RLS alone without hand-rolling an EXISTS
-- per entity_type — not worth it here, because a row inserted this way is
-- otherwise inert: nothing re-executes a workflow_runs row just because it
-- exists, only this codebase's own server-side calls to startWorkflowFromEvent
-- do that. The UPDATE policies, by contrast, get real ownership enforcement
-- for free: Postgres requires a row to satisfy an UPDATE-applicable policy
-- AND a SELECT-applicable one, so even though workflow_runs_org_update's own
-- USING is org-wide, an update only actually succeeds for rows that also
-- pass workflow_runs_requester_read (or hr_full) — i.e. your own run, or
-- admin/hr's.
create policy "approval_requests_requester_insert" on public.approval_requests
  for insert to authenticated
  with check (requested_by = auth.uid() and org_id = current_org_id());

create policy "approval_steps_requester_insert" on public.approval_steps
  for insert to authenticated
  with check (approval_request_requested_by(approval_request_id) = auth.uid());

-- Mirrors workflow_run_nodes_requester_read's join exactly (0047) — needed
-- both so a submitting employee can read their own run at all, and so it
-- can serve as the SELECT-applicable half of the UPDATE gate below.
create policy "workflow_runs_requester_read" on public.workflow_runs
  for select to authenticated
  using (
    org_id = current_org_id()
    and exists (
      select 1 from public.profile_change_requests pcr
      join public.employees e on e.id = pcr.employee_id
      join public.app_users au on au.employee_id = e.id
      where pcr.id = workflow_runs.entity_id and workflow_runs.entity_type = 'profile_change_request' and au.id = auth.uid()
    )
  );

create policy "workflow_runs_org_insert" on public.workflow_runs
  for insert to authenticated
  with check (org_id = current_org_id());

create policy "workflow_runs_org_update" on public.workflow_runs
  for update to authenticated
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

create policy "workflow_run_nodes_org_insert" on public.workflow_run_nodes
  for insert to authenticated
  with check (org_id = current_org_id());

create policy "workflow_run_nodes_org_update" on public.workflow_run_nodes
  for update to authenticated
  using (org_id = current_org_id())
  with check (org_id = current_org_id());
