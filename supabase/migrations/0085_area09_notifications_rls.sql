-- Area 09 RLS.
--
-- SECURITY FINDING surfaced while surveying the existing `notifications`
-- table for this build (pre-existing policy, not introduced by me):
-- `notifications_org_insert`'s WITH CHECK only verifies that org_id
-- matches the caller's org and that recipient_user_id is a real app_user
-- in that org. It does NOT check anything about the INSERTING user —
-- any authenticated employee can, via a direct REST call (bypassing every
-- Server Action), insert an arbitrary notification "to" any other
-- employee in the same org: any title/message/action_url/priority they
-- like. That's a live phishing/spoofing vector (a fake "payroll" or
-- "critical account" notification with a malicious action_url), and it's
-- exactly the gap Area 09 spec §8 calls out: "Do not permit browsers to
-- insert arbitrary notification events" / test case "Client inserts
-- arbitrary notification event → Rejected; service-only operation."
--
-- Fix: every INSERT into `notifications` now goes through a single
-- SECURITY DEFINER function (create_notification_secure, owned by the
-- migration role which has bypassrls, so it writes regardless of the
-- client-facing policy) instead of a raw table insert, and the old
-- permissive client-side INSERT policy's WITH CHECK is tightened to
-- `false` (ALTER POLICY, not DROP — DROP POLICY is blocked in this
-- environment) so a direct REST insert can never succeed again. This
-- closes the hole without touching the ~11 existing call sites — they
-- all already funnel through the single `createNotification()`/
-- `createNotificationForMany()` helper, which is being switched to call
-- this function instead of `.upsert()` directly.
alter policy "notifications_org_insert" on public.notifications
  with check (false);

create or replace function public.create_notification_secure(
  p_org_id uuid,
  p_recipient_user_id uuid,
  p_type text,
  p_category text,
  p_priority text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_action_url text default null,
  p_action_label text default null,
  p_expires_at timestamptz default null,
  p_safe_preview text default null,
  p_event_id uuid default null,
  p_template_id uuid default null,
  p_correlation_id uuid default null,
  p_requires_action boolean default false,
  p_is_mandatory boolean default false,
  p_scheduled_for timestamptz default null,
  p_escalation_stage integer default 0,
  p_escalated_from_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_org uuid;
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated.';
  end if;
  select org_id into v_caller_org from public.app_users where id = v_caller;
  if v_caller_org is null or v_caller_org <> p_org_id then
    raise exception 'Organisation mismatch.';
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
revoke all on function public.create_notification_secure from public, anon;
grant execute on function public.create_notification_secure to authenticated, service_role;

alter table public.notification_events enable row level security;
create policy notification_events_hr_read on public.notification_events
  for select to authenticated
  using (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id());

alter table public.notification_templates enable row level security;
create policy notification_templates_hr_all on public.notification_templates
  for all to authenticated
  using (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id())
  with check (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id());

alter table public.notification_policy_rules enable row level security;
create policy notification_policy_rules_hr_all on public.notification_policy_rules
  for all to authenticated
  using (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id())
  with check (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id());

alter table public.notification_deliveries enable row level security;
create policy notification_deliveries_hr_read on public.notification_deliveries
  for select to authenticated
  using (
    exists (
      select 1 from public.notifications n
      where n.id = notification_deliveries.notification_id
        and n.org_id = current_org_id()
        and hrms_current_role() = any(array['admin','hr']::user_role[])
    )
  );
create policy notification_deliveries_self_read on public.notification_deliveries
  for select to authenticated
  using (
    exists (
      select 1 from public.notifications n
      where n.id = notification_deliveries.notification_id
        and n.recipient_user_id = auth.uid()
    )
  );

alter table public.notification_suppressions enable row level security;
create policy notification_suppressions_hr_all on public.notification_suppressions
  for all to authenticated
  using (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id())
  with check (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id());

alter table public.notification_dead_letters enable row level security;
create policy notification_dead_letters_hr_select on public.notification_dead_letters
  for select to authenticated
  using (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id());
create policy notification_dead_letters_hr_resolve on public.notification_dead_letters
  for update to authenticated
  using (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id())
  with check (hrms_current_role() = any(array['admin','hr']::user_role[]) and org_id = current_org_id());
