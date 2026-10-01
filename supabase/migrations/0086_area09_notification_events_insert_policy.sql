-- Server Actions in this codebase write business data and notification
-- side-effects using the per-request, RLS-scoped client (no call site
-- anywhere uses a service-role client from inside a Server Action) — so
-- the outbox writer (emitNotificationEvent) needs an authenticated INSERT
-- path, mirroring domain_events_org_insert's existing pattern: scoped to
-- the caller's own org, actor_id pinned to the caller (never spoofable),
-- id/created_at/processing fields are all server-defaulted.
--
-- This does NOT reopen the "client inserts arbitrary notification event"
-- gap (spec §30/N-security): a forged row here can, at worst, cause the
-- orchestrator to re-notify a REAL recipient about a REAL aggregate (the
-- recipient resolver re-derives who the approver/assignee/owner actually
-- is from the authoritative tables by aggregate_id at processing time —
-- see recipient-resolver.ts — never trusting payload-supplied user ids
-- directly). Worst case is rate-limited noise, not spoofed content to an
-- attacker-chosen recipient, and it's fully auditable (actor_id is the
-- real inserting user, not attacker-controlled).
create policy notification_events_org_insert on public.notification_events
  for insert to authenticated
  with check (
    org_id = current_org_id()
    and (actor_id is null or actor_id = auth.uid())
  );
