-- Bug fix: ai_action_events only had an hr/admin "for all" policy, which
-- silently blocked a non-HR requester's own action lifecycle (staged/
-- confirmed/rejected/executed) from being logged at all, since
-- gateway.ts/confirm-action.ts insert on the CALLER's own session client
-- by design (RLS-as-backstop), never a service-role client. Add an insert
-- policy for the actor logging their own event.
create policy ai_action_events_actor_insert on ai_action_events for insert
  with check (org_id = current_org_id() and actor_user_id = (select auth.uid()));
