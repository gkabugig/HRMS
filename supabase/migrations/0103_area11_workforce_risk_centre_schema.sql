-- Area 11 (Workforce Risk Centre), spec §6. A genuinely new authoritative
-- register — ai_anomalies/ai_insights (Area 10's rule-based scoring tables
-- for payroll/performance) lack ownership, a remediation lifecycle,
-- comments and suppression, so they are NOT reused here; this is new
-- authoritative state, not a duplicate of them. The rule engine (6.6) does
-- draw its *inputs* from Area 10 metrics/data-quality events and existing
-- operational tables, never a second copy of employee/attendance/approval
-- data.

create table if not exists workforce_risk_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  description text not null,
  category text not null check (category in (
    'compliance','employment_lifecycle','workforce_planning','attendance',
    'workflow','hr_service','data_quality','document','compensation_control',
    'security_access','operational'
  )),
  -- §6.4 risk_score = impact x likelihood x urgency x confidence. Each
  -- weight is stored as a 0.00-1.00 default (the "typical" weight for this
  -- rule when it fires); risk_score = round(product * 100), which lands
  -- naturally in the spec's 0-100 banding.
  default_impact_weight numeric(3,2) not null default 0.60 check (default_impact_weight between 0 and 1),
  default_likelihood_weight numeric(3,2) not null default 0.60 check (default_likelihood_weight between 0 and 1),
  default_urgency_weight numeric(3,2) not null default 0.60 check (default_urgency_weight between 0 and 1),
  default_confidence_weight numeric(3,2) not null default 0.80 check (default_confidence_weight between 0 and 1),
  threshold_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

comment on table workforce_risk_rules is 'Area 11 versioned risk rule definitions and thresholds (spec §6.5/§6.7).';

create table if not exists workforce_risks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  rule_id uuid not null references workforce_risk_rules(id),
  rule_code text not null,
  title text not null,
  description text not null,
  category text not null,
  status text not null default 'detected' check (status in (
    'detected','triaged','assigned','investigating','remediation_required',
    'resolved','verified','closed','dismissed','duplicate','accepted'
  )),
  impact_weight numeric(3,2) not null,
  likelihood_weight numeric(3,2) not null,
  urgency_weight numeric(3,2) not null,
  confidence_weight numeric(3,2) not null,
  risk_score numeric(5,2) not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  entity_type text not null,
  entity_id uuid,
  evidence_json jsonb not null default '[]'::jsonb,
  owner_user_id uuid references app_users(id),
  owner_role text,
  acceptance_rationale text,
  acceptance_expiry date,
  accepted_by uuid references app_users(id),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  verified_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Deterministic dedupe (§6.6, test 11-02): re-detecting the same
  -- rule+entity reopens this row (status -> detected, last_detected_at
  -- refreshed) instead of creating a parallel risk.
  constraint workforce_risks_natural_key unique (org_id, rule_id, entity_type, entity_id)
);

comment on table workforce_risks is 'Area 11 risk register and current state (spec §6.5/§6.2 lifecycle).';

create index if not exists workforce_risks_open_idx on workforce_risks (org_id, status) where status not in ('closed','dismissed');
create index if not exists workforce_risks_owner_idx on workforce_risks (owner_user_id) where owner_user_id is not null;
create index if not exists workforce_risks_entity_idx on workforce_risks (entity_type, entity_id);
create index if not exists workforce_risks_severity_idx on workforce_risks (org_id, severity) where status not in ('closed','dismissed');

create table if not exists workforce_risk_events (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references workforce_risks(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references app_users(id),
  note text,
  created_at timestamptz not null default now()
);

comment on table workforce_risk_events is 'Area 11 risk lifecycle/audit events (spec §6.5).';

create index if not exists workforce_risk_events_risk_idx on workforce_risk_events (risk_id, created_at);

create table if not exists workforce_risk_actions (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references workforce_risks(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references app_users(id),
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  workflow_run_id uuid references workflow_runs(id),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

comment on table workforce_risk_actions is 'Area 11 remediation tasks (spec §6.5); workflow_run_id links to an Area 03 remediation workflow when one was started.';

create index if not exists workforce_risk_actions_risk_idx on workforce_risk_actions (risk_id);
create index if not exists workforce_risk_actions_assignee_idx on workforce_risk_actions (assigned_to) where assigned_to is not null and status not in ('done','cancelled');

create table if not exists workforce_risk_comments (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references workforce_risks(id) on delete cascade,
  author_user_id uuid not null references app_users(id),
  body text not null,
  -- §6.8 "Employee-visible risk content is explicitly configured, not
  -- default" — internal is the default; employee_visible is opt-in per
  -- comment, never inferred.
  visibility text not null default 'internal' check (visibility in ('internal','employee_visible')),
  created_at timestamptz not null default now()
);

comment on table workforce_risk_comments is 'Area 11 controlled collaboration on a risk (spec §6.5/§6.8).';

create index if not exists workforce_risk_comments_risk_idx on workforce_risk_comments (risk_id, created_at);

create table if not exists workforce_risk_suppressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  rule_id uuid not null references workforce_risk_rules(id),
  entity_type text not null,
  entity_id uuid,
  reason text not null,
  authorised_by uuid not null references app_users(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint workforce_risk_suppressions_ends_after_starts check (ends_at > starts_at)
);

comment on table workforce_risk_suppressions is 'Area 11 time-bound authorised suppression (spec §6.5/§6.8 — "risk acceptance requires authorised actor, rationale and expiry/review date").';

create index if not exists workforce_risk_suppressions_lookup_idx on workforce_risk_suppressions (org_id, rule_id, entity_type, entity_id, ends_at);

-- RLS. Same hr/admin-table-level + manager-scoped-via-server-action pattern
-- used throughout (metric_definitions, notifications, etc.) — a manager
-- sees only risks concerning their own subordinate population, resolved by
-- application code (is_manager_of / getManagerScope), never a raw RLS
-- scan over free-text entity references.
alter table workforce_risk_rules enable row level security;
alter table workforce_risks enable row level security;
alter table workforce_risk_events enable row level security;
alter table workforce_risk_actions enable row level security;
alter table workforce_risk_comments enable row level security;
alter table workforce_risk_suppressions enable row level security;

create policy workforce_risk_rules_hr_all on workforce_risk_rules
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy workforce_risks_hr_all on workforce_risks
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- A manager may see (read-only) a risk whose entity_type='employee' and
-- entity_id is one of their reports, via is_manager_of() — the same
-- function workflow_tasks_manager_team_read (Area 09) already uses.
create policy workforce_risks_manager_read on workforce_risks
  for select using (
    hrms_current_role() = 'manager'
    and org_id = current_org_id()
    and entity_type = 'employee'
    and entity_id is not null
    and is_manager_of(entity_id)
  );

create policy workforce_risk_events_hr_all on workforce_risk_events
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from workforce_risks r where r.id = risk_id and r.org_id = current_org_id())
  );

create policy workforce_risk_actions_hr_all on workforce_risk_actions
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from workforce_risks r where r.id = risk_id and r.org_id = current_org_id())
  );

create policy workforce_risk_actions_assignee_read on workforce_risk_actions
  for select using (assigned_to = (select id from app_users where id = auth.uid()));

create policy workforce_risk_actions_assignee_update on workforce_risk_actions
  for update using (assigned_to = (select id from app_users where id = auth.uid()));

create policy workforce_risk_comments_hr_all on workforce_risk_comments
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from workforce_risks r where r.id = risk_id and r.org_id = current_org_id())
  );

create policy workforce_risk_suppressions_hr_all on workforce_risk_suppressions
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
