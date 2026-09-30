-- Phase 3 Intelligence: foundation layer.
--
-- Scope for this migration (per the Phase 3 spec, foundation + 3 priority
-- capabilities cut agreed with the org owner): the canonical metric layer
-- for Workforce Analytics, the shared AI model/insight/feedback registry,
-- and the Payroll Anomaly record shape. The AI HR Assistant, Recruitment
-- AI (CV parsing/matching) and Predictive Forecasting are deferred — they
-- need a live LLM API key and are a follow-up, not built here.
--
-- Note: metric_definitions/metric_dimensions/metric_snapshots and
-- dashboard_definitions/dashboard_permissions/insight_cards/
-- data_quality_checks already exist in the live project from an
-- interrupted earlier session that never got captured as a migration
-- file. All eight tables were empty (0 rows), so this migration drops and
-- rebuilds them cleanly to match one documented, versioned design instead
-- of leaving the repo's migration history out of sync with the database.
-- dashboard_definitions/dashboard_permissions are dropped outright: the
-- nine dashboards are fixed, code-defined screens for this phase (no
-- visual dashboard builder), so a DB-configurable dashboard-definition
-- table would be an unused duplicate concept.

drop table if exists insight_cards cascade;
drop table if exists dashboard_permissions cascade;
drop table if exists dashboard_definitions cascade;
drop table if exists metric_snapshots cascade;
drop table if exists metric_dimensions cascade;
drop table if exists metric_definitions cascade;
drop table if exists data_quality_checks cascade;

-- ---------------------------------------------------------------------
-- Metric layer (spec §4.2): one source of truth for KPI definitions, the
-- dimensions they can be sliced by, and their time-series values.
-- ---------------------------------------------------------------------

create table metric_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  key text not null,
  name text not null,
  description text not null,
  formula text not null,
  population text not null,
  exclusions text,
  unit text not null, -- 'count' | 'currency' | 'percent' | 'days' | 'ratio'
  category text not null, -- headcount | cost | attendance | leave | recruitment | performance | learning | compliance
  owner_role text not null default 'hr',
  refresh_frequency text not null default 'daily', -- 'on_demand' | 'daily'
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create table metric_dimensions (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references metric_definitions(id) on delete cascade,
  dimension_key text not null, -- 'department' | 'location' | 'manager' | 'employment_type' | 'all'
  dimension_label text not null,
  unique (metric_id, dimension_key)
);

create table metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  metric_key text not null,
  dimension_key text not null default 'all',
  dimension_value text not null default 'all',
  snapshot_date date not null default current_date,
  value numeric not null,
  population_count integer,
  created_at timestamptz not null default now(),
  unique (org_id, metric_key, dimension_key, dimension_value, snapshot_date)
);

create index metric_snapshots_lookup on metric_snapshots (org_id, metric_key, snapshot_date desc);

create table data_quality_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  check_name text not null,
  status text not null, -- 'ok' | 'stale' | 'missing' | 'error'
  details text,
  checked_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Shared AI model/prompt registry (spec §11). Even where "generation" is
-- rule-based rather than an LLM call in this phase, every insight/anomaly
-- record below is traceable to a versioned entry here — the spec's
-- non-negotiable "version models, prompts, tools" requirement applies
-- to deterministic scoring logic too.
-- ---------------------------------------------------------------------

create table ai_models (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  key text not null, -- 'payroll-anomaly-detector' | 'performance-insight-generator' | ...
  name text not null,
  kind text not null, -- 'anomaly_detection' | 'insight_generation' | 'forecasting' | 'assistant' | 'matching'
  provider text not null default 'rule-based', -- 'rule-based' | 'anthropic' | 'openai' | ...
  version text not null,
  status text not null default 'active', -- 'active' | 'shadow' | 'deprecated'
  purpose text not null,
  owner_role text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (org_id, key, version)
);

-- ---------------------------------------------------------------------
-- ai_insights: one shared table for every generated insight card, whether
-- it's a Workforce Analytics highlight or a Performance Insight for a
-- specific employee/goal. Kept as a single concept per the build's
-- non-negotiable against duplicate tables for the same thing.
-- ---------------------------------------------------------------------

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  model_id uuid references ai_models(id),
  category text not null, -- 'workforce_analytics' | 'performance' | 'payroll' | 'compliance'
  entity_type text not null, -- 'org' | 'department' | 'employee' | 'goal' | 'appraisal'
  entity_id uuid,
  title text not null,
  body text not null,
  evidence_json jsonb not null default '[]'::jsonb,
  suggested_action text,
  severity text not null default 'info', -- 'info' | 'attention' | 'high'
  status text not null default 'open', -- 'open' | 'acknowledged' | 'dismissed' | 'resolved'
  resolved_by uuid references app_users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index ai_insights_org_status on ai_insights (org_id, status, created_at desc);
create index ai_insights_entity on ai_insights (org_id, entity_type, entity_id);

-- ---------------------------------------------------------------------
-- ai_anomalies: payroll anomaly records exactly per spec §6.3.
-- ---------------------------------------------------------------------

create table ai_anomalies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  model_id uuid references ai_models(id),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  anomaly_type text not null,
  entity_type text not null default 'employee', -- 'employee' | 'department' | 'run'
  entity_id uuid,
  severity text not null default 'informational', -- 'informational' | 'review' | 'high'
  score numeric,
  expected_value numeric,
  actual_value numeric,
  drivers_json jsonb not null default '[]'::jsonb,
  explanation text not null,
  status text not null default 'open', -- 'open' | 'reviewed' | 'resolved' | 'false_positive'
  reviewer_id uuid references app_users(id),
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now()
);

create index ai_anomalies_run on ai_anomalies (payroll_run_id, severity, status);

-- ---------------------------------------------------------------------
-- ai_feedback: the feedback loop the spec requires for every AI surface
-- (useful / not useful / false positive / resolved).
-- ---------------------------------------------------------------------

create table ai_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  user_id uuid not null references app_users(id),
  insight_id uuid references ai_insights(id) on delete cascade,
  anomaly_id uuid references ai_anomalies(id) on delete cascade,
  feedback_type text not null, -- 'useful' | 'not_useful' | 'false_positive' | 'resolved'
  comment text,
  created_at timestamptz not null default now(),
  constraint ai_feedback_target_check check (
    (insight_id is not null and anomaly_id is null) or
    (insight_id is null and anomaly_id is not null)
  )
);

-- ---------------------------------------------------------------------
-- RLS. Workforce Analytics is "Executive and HR visibility" per the
-- spec's own capability table, so the metric layer and every AI record
-- here are admin/hr only for now — narrower than the org-wide read the
-- interrupted draft had left in place, and consistent with how payroll
-- itself is already invisible to managers/employees elsewhere in this
-- schema. Performance insights that surface on an individual's own
-- Employee 360 profile are exposed later through a server-side
-- aggregator (defense in depth, same pattern as get-employee-360.ts),
-- not by widening these base policies.
-- ---------------------------------------------------------------------

alter table metric_definitions enable row level security;
alter table metric_dimensions enable row level security;
alter table metric_snapshots enable row level security;
alter table data_quality_checks enable row level security;
alter table ai_models enable row level security;
alter table ai_insights enable row level security;
alter table ai_anomalies enable row level security;
alter table ai_feedback enable row level security;

create policy metric_definitions_hr_all on metric_definitions
  for all
  using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

create policy metric_dimensions_hr_all on metric_dimensions
  for all
  using (
    hrms_current_role() in ('admin', 'hr')
    and exists (select 1 from metric_definitions d where d.id = metric_dimensions.metric_id and d.org_id = current_org_id())
  )
  with check (
    exists (select 1 from metric_definitions d where d.id = metric_dimensions.metric_id and d.org_id = current_org_id())
  );

create policy metric_snapshots_hr_all on metric_snapshots
  for all
  using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

create policy data_quality_checks_hr_read on data_quality_checks
  for select
  using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

create policy ai_models_admin_all on ai_models
  for all
  using (hrms_current_role() = 'admin' and org_id = current_org_id())
  with check (hrms_current_role() = 'admin' and org_id = current_org_id());

create policy ai_models_hr_read on ai_models
  for select
  using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

-- ai_insights: HR/admin see everything in their org. A manager may read an
-- insight scoped to an employee they manage (performance insights on
-- their own team). An employee may read an insight scoped to themself.
-- Nobody but HR/admin can write, resolve or dismiss.
create policy ai_insights_hr_all on ai_insights
  for all
  using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

create policy ai_insights_manager_read on ai_insights
  for select
  using (
    org_id = current_org_id()
    and hrms_current_role() = 'manager'
    and category = 'performance'
    and entity_type = 'employee'
    and is_manager_of(entity_id)
  );

create policy ai_insights_self_read on ai_insights
  for select
  using (
    org_id = current_org_id()
    and category = 'performance'
    and entity_type = 'employee'
    and entity_id = current_employee_id()
  );

-- ai_anomalies: payroll-sensitive, admin/hr only — same visibility as
-- payslips and statutory rates elsewhere in this schema.
create policy ai_anomalies_hr_all on ai_anomalies
  for all
  using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

-- ai_feedback: HR/admin read everything in org; any authenticated org
-- member can leave feedback on an insight/anomaly they were allowed to
-- read (checked again here, not just trusted from the UI).
create policy ai_feedback_hr_read on ai_feedback
  for select
  using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

create policy ai_feedback_self_read on ai_feedback
  for select
  using (org_id = current_org_id() and user_id = (select id from app_users where app_users.id = auth.uid()));

create policy ai_feedback_self_write on ai_feedback
  for insert
  with check (
    org_id = current_org_id()
    and user_id = auth.uid()
    and (
      (insight_id is not null and exists (
        select 1 from ai_insights i where i.id = ai_feedback.insight_id and i.org_id = current_org_id()
      ))
      or
      (anomaly_id is not null and hrms_current_role() in ('admin', 'hr') and exists (
        select 1 from ai_anomalies a where a.id = ai_feedback.anomaly_id and a.org_id = current_org_id()
      ))
    )
  );
