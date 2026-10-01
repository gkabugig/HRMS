-- CRITICAL bug found during N-series acceptance testing: create_notification_secure
-- required auth.uid() to be non-null and to belong to an app_users row in
-- p_org_id. That's correct for the handful of legacy call sites that still
-- pass the end user's OWN session client (leave/attendance/etc, unchanged
-- by Area 09) — but the entire Area 09 governed pipeline
-- (orchestrator.ts's deliverToRecipient, called from scheduler.ts's
-- processEventImmediately/processPendingNotificationEvents, which run
-- against createAdminClient()'s service-role client) calls this same RPC
-- to create the IN-APP notification for a recipient who is virtually never
-- the acting session. A service-role request carries no JWT "sub" claim at
-- all, so auth.uid() is NULL and the function's very first check
-- ("Not authenticated.") rejected every single call — meaning not one
-- in-app notification could ever have been created by the governed
-- pipeline in production, for any of the 14 cataloged events. Confirmed
-- by direct RPC call during testing (reproduces "Not authenticated.").
--
-- Fix: when the caller is the service_role (auth.role() = 'service_role'),
-- skip the caller-identity/org-match check — that caller is already
-- trusted (it's Area 09's own orchestrator, which resolves and
-- re-authorizes the recipient server-side from authoritative tables
-- before ever reaching this function — see recipient-resolver.ts). An
-- ordinary 'authenticated' session still goes through the original,
-- stricter check unchanged.
create or replace function public.create_notification_secure(
  p_org_id uuid, p_recipient_user_id uuid, p_type text, p_category text, p_priority text,
  p_title text, p_message text, p_entity_type text default null, p_entity_id uuid default null,
  p_action_url text default null, p_action_label text default null, p_expires_at timestamptz default null,
  p_safe_preview text default null, p_event_id uuid default null, p_template_id uuid default null,
  p_correlation_id uuid default null, p_requires_action boolean default false, p_is_mandatory boolean default false,
  p_scheduled_for timestamptz default null, p_escalation_stage integer default 0, p_escalated_from_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_org uuid;
  v_id uuid;
  v_is_service_role boolean := auth.role() = 'service_role';
begin
  if not v_is_service_role then
    if v_caller is null then
      raise exception 'Not authenticated.';
    end if;
    select org_id into v_caller_org from public.app_users where id = v_caller;
    if v_caller_org is null or v_caller_org <> p_org_id then
      raise exception 'Organisation mismatch.';
    end if;
  end if;

  if not exists (select 1 from public.app_users where id = p_recipient_user_id and org_id = p_org_id) then
    raise exception 'Recipient is not a member of this organisation.';
  end if;

  if p_is_mandatory then
    if p_event_id is null then
      raise exception 'is_mandatory requires a governed event_id.';
    end if;
    if not exists (
      select 1 from public.notification_events ne
      join public.notification_policy_rules pr
        on pr.org_id = ne.org_id and pr.event_type = ne.event_type and pr.mandatory
      where ne.id = p_event_id
    ) then
      raise exception 'is_mandatory does not match an active mandatory policy rule.';
    end if;
  end if;

  insert into public.notifications (
    org_id, recipient_user_id, type, category, priority, title, message,
    entity_type, entity_id, action_url, action_label, expires_at, safe_preview,
    event_id, template_id, correlation_id, requires_action, is_mandatory,
    scheduled_for, escalation_stage, escalated_from_id
  ) values (
    p_org_id, p_recipient_user_id, p_type, p_category, p_priority, p_title, p_message,
    p_entity_type, p_entity_id, p_action_url, p_action_label, p_expires_at, p_safe_preview,
    p_event_id, p_template_id, p_correlation_id, p_requires_action, p_is_mandatory,
    coalesce(p_scheduled_for, now()), p_escalation_stage, p_escalated_from_id
  )
  on conflict (recipient_user_id, type, entity_type, entity_id) do nothing
  returning id into v_id;

  return v_id;
end;
$$;
