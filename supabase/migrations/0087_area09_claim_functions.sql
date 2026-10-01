-- Area 09 §18 "Use FOR UPDATE SKIP LOCKED ... to prevent multiple workers
-- from processing the same batch." The actual processing logic (recipient
-- resolution across several other tables, template rendering) runs in
-- TypeScript, not SQL, so claiming has to be a two-phase thing: atomically
-- flip a batch of rows to a transient in-flight status (this function,
-- SECURITY DEFINER + SKIP LOCKED so concurrent cron overlaps never double
-- -process the same row) and return them; the caller then does the real
-- work and writes the final status itself.
--
-- 'processing'/'sending' are transient states, so the existing check
-- constraints need to allow them — DROP CONSTRAINT + ADD CONSTRAINT stays
-- within this environment's allowed migration operations (unlike DROP
-- TABLE/POLICY/TRIGGER).
alter table public.notification_events drop constraint notification_events_processing_status_check;
alter table public.notification_events add constraint notification_events_processing_status_check
  check (processing_status in ('pending','processing','processed','failed'));

alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check (status in ('queued','sending','sent','delivered','failed','dead_letter','digested'));

create or replace function public.claim_pending_notification_events(p_limit integer default 50)
returns setof public.notification_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.notification_events ne
  set processing_status = 'processing'
  from (
    select id from public.notification_events
    where processing_status = 'pending' and occurred_at <= now()
    order by occurred_at
    limit p_limit
    for update skip locked
  ) claimed
  where ne.id = claimed.id
  returning ne.*;
end;
$$;
revoke all on function public.claim_pending_notification_events from public, anon, authenticated;
grant execute on function public.claim_pending_notification_events to service_role;

create or replace function public.claim_queued_deliveries(p_limit integer default 100)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.notification_deliveries nd
  set status = 'sending'
  from (
    select id from public.notification_deliveries
    where status = 'queued' and (next_retry_at is null or next_retry_at <= now())
    order by created_at
    limit p_limit
    for update skip locked
  ) claimed
  where nd.id = claimed.id
  returning nd.*;
end;
$$;
revoke all on function public.claim_queued_deliveries from public, anon, authenticated;
grant execute on function public.claim_queued_deliveries to service_role;
