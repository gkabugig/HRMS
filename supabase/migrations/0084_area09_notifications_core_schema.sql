-- Area 09 — Intelligent Notifications: core schema.
--
-- Reconciliation (spec §31 step 1 / §7 "target contract, not permission to
-- duplicate"): this codebase already has a lightweight, synchronous,
-- in-app-only notification system (`notifications`, `notification_preferences`,
-- built in earlier Areas) and a generic audit-style `domain_events` log.
-- Area 09 upgrades this into the governed platform the spec describes:
--   - `notifications`/`notification_preferences` are EXTENDED in place
--     (new nullable/defaulted columns only) so every existing caller
--     (leave, attendance, payroll, documents, workflows, approvals,
--     service-requests — ~11 call sites) keeps working unchanged.
--   - `domain_events` is untouched — it remains the general Area 01 audit
--     trail, a different concern from a notification-processing outbox.
--   - `notification_events` is a genuinely new table: it is specifically
--     a durable, idempotent OUTBOX that a worker polls and marks
--     processed/failed — domain_events has no such processing contract.
--   - `notification_templates`, `notification_deliveries`,
--     `notification_policy_rules`, `notification_suppressions`,
--     `notification_dead_letters` are genuinely new — nothing in Areas
--     01-08 models per-channel delivery, retry, policy or dead-letter.
--   - Spec's priority vocabulary ('critical'|'high'|'normal'|'low') is
--     NOT introduced as a second enum: the existing
--     'critical'|'action_required'|'reminder'|'information' vocabulary
--     (already load-bearing across ~15 files) is kept and reused for
--     policy rows and templates too, with the mapping documented in
--     notification-types.ts. Renaming it would be a large, pointless
--     blast radius for a cosmetic difference.
--   - Spec's `organisation_id`/`user_id` naming is mapped onto this
--     repo's existing `org_id` throughout, consistent with every other
--     table in the schema.

alter table public.organizations
  add column if not exists default_timezone text not null default 'Africa/Nairobi';

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  event_type text not null,
  aggregate_type text,
  aggregate_id uuid,
  actor_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processed','failed')),
  processing_error text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);
create index notification_events_pending_idx
  on public.notification_events (occurred_at)
  where processing_status = 'pending';
create index notification_events_correlation_idx on public.notification_events (correlation_id);

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  template_key text not null,
  version integer not null default 1,
  name text not null,
  description text,
  event_type text not null,
  channel text not null check (channel in ('in_app','email','sms','push','whatsapp')),
  subject_template text,
  body_template text not null,
  safe_preview_template text,
  action_label_template text,
  action_url_template text,
  locale text not null default 'en-KE',
  priority text not null default 'information'
    check (priority in ('critical','action_required','reminder','information')),
  is_mandatory boolean not null default false,
  is_active boolean not null default true,
  variables_schema jsonb not null default '{}'::jsonb,
  first_used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, template_key, version, channel, locale)
);

create or replace function public.enforce_template_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.first_used_at is not null then
    if new.subject_template is distinct from old.subject_template
       or new.body_template is distinct from old.body_template
       or new.safe_preview_template is distinct from old.safe_preview_template
       or new.action_label_template is distinct from old.action_label_template
       or new.action_url_template is distinct from old.action_url_template
       or new.variables_schema is distinct from old.variables_schema then
      raise exception 'This template version has already been used to render a notification and cannot be edited. Create a new version instead.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_enforce_template_immutability
  before update on public.notification_templates
  for each row
  execute function public.enforce_template_immutability();

create table public.notification_policy_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  event_type text not null,
  category text not null,
  priority text not null default 'information'
    check (priority in ('critical','action_required','reminder','information')),
  mandatory boolean not null default false,
  allowed_channels text[] not null default array['in_app'],
  fallback_channels text[] not null default '{}',
  dedupe_window_seconds integer not null default 300,
  max_per_hour integer,
  quiet_hours_allowed boolean not null default false,
  escalation_after_minutes integer,
  max_escalation_depth integer not null default 2,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, event_type)
);

alter table public.notifications
  add column if not exists event_id uuid references public.notification_events(id),
  add column if not exists template_id uuid references public.notification_templates(id),
  add column if not exists safe_preview text,
  add column if not exists action_label text,
  add column if not exists correlation_id uuid,
  add column if not exists requires_action boolean not null default false,
  add column if not exists is_mandatory boolean not null default false,
  add column if not exists scheduled_for timestamptz not null default now(),
  add column if not exists dismissed_at timestamptz,
  add column if not exists escalation_stage integer not null default 0,
  add column if not exists escalated_from_id uuid references public.notifications(id);
create index if not exists notifications_scheduled_for_idx on public.notifications (scheduled_for) where read_at is null and dismissed_at is null;
create index if not exists notifications_correlation_idx on public.notifications (correlation_id);
create index if not exists notifications_event_id_idx on public.notifications (event_id);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app','email','sms','push','whatsapp')),
  destination_masked text,
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','failed','dead_letter','digested')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message text,
  provider_response jsonb,
  digest_group text,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index notification_deliveries_retry_idx on public.notification_deliveries (next_retry_at) where status = 'queued';
create index notification_deliveries_digest_idx on public.notification_deliveries (channel, digest_group) where status = 'digested';

alter table public.notification_preferences
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists timezone text,
  add column if not exists org_id uuid references public.organizations(id);

create table public.notification_suppressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  user_id uuid,
  category text,
  channel text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.notification_dead_letters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  notification_id uuid references public.notifications(id),
  delivery_id uuid references public.notification_deliveries(id),
  channel text,
  failure_reason text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
