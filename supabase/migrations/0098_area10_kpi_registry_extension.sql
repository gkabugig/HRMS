-- Area 10 (Workforce Intelligence 2.0) foundation. Per spec §11.1 ("inspect
-- before adding tables, map existing equivalents, avoid duplicate
-- authoritative tables"): metric_definitions/metric_dimensions/
-- metric_snapshots/data_quality_checks already implement the spec's
-- analytics_kpi_definitions/analytics_dimensions(partial)/
-- workforce_metric_snapshots/analytics_data_quality_events(partial) concepts
-- (Phase 3 workforce-analytics work). We EXTEND these rather than creating
-- parallel tables, and add only the genuinely new concepts: a standard
-- dimension catalogue, a per-finding data-quality event log (distinct from
-- data_quality_checks, which is an aggregate check-run log), and forecasting.

comment on table metric_definitions is 'Area 10 KPI registry (spec analytics_kpi_definitions). Extended with grain/version/required_permission/source.';
comment on table metric_snapshots is 'Area 10 time-series KPI values by dimension (spec workforce_metric_snapshots).';

alter table metric_definitions
  add column if not exists grain text not null default 'organisation',
  add column if not exists version integer not null default 1,
  add column if not exists required_permission text,
  add column if not exists source text;

alter table metric_definitions
  add constraint metric_definitions_grain_check
  check (grain in ('organisation','business_unit','department','section_team','location','position','grade','manager','employment_type','employment_status'));

-- 5.5 Required dimensions: a standard, org-seeded catalogue so every module
-- (snapshots, drill-down, forecasts, risk rules, AI tools) references the
-- same dimension vocabulary instead of inventing ad hoc dimension_key values.
create table if not exists analytics_dimensions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  dimension_key text not null,
  dimension_label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, dimension_key)
);

comment on table analytics_dimensions is 'Area 10 standard dimension catalogue (spec analytics_dimensions, §5.5).';

insert into analytics_dimensions (org_id, dimension_key, dimension_label, sort_order)
select o.id, d.key, d.label, d.sort_order
from organizations o
cross join (values
  ('organisation', 'Organisation', 1),
  ('business_unit', 'Business Unit', 2),
  ('department', 'Department', 3),
  ('section_team', 'Section/Team', 4),
  ('location', 'Location', 5),
  ('position', 'Position', 6),
  ('grade', 'Grade', 7),
  ('manager', 'Manager', 8),
  ('employment_type', 'Employment Type', 9),
  ('employment_status', 'Employment Status', 10),
  ('time', 'Time', 11)
) as d(key, label, sort_order)
on conflict (org_id, dimension_key) do nothing;

-- 5.9 Data-quality intelligence: per-finding event log. data_quality_checks
-- remains the aggregate check-run status table (e.g. "nightly sweep: 3
-- failed"); this table holds the individual flagged records those checks
-- surface, each resolvable and auditable on its own, which is what the
-- Data Quality screen (§13) and the forecast data-quality gate (§5.8) need.
create table if not exists analytics_data_quality_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  issue_code text not null,
  issue_category text not null,
  entity_type text not null,
  entity_id uuid,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  description text not null,
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references app_users(id),
  resolution_note text,
  constraint analytics_dq_events_issue_code_check check (issue_code in (
    'missing_manager','inactive_position_assignment','multiple_primary_positions',
    'missing_employment_dates','invalid_org_relationship','duplicate_identifier',
    'missing_required_document','invalid_or_expired_position','compensation_outside_band',
    'orphaned_reference'
  ))
);

comment on table analytics_data_quality_events is 'Area 10 per-finding data-quality log (spec analytics_data_quality_events, §5.9).';

create index if not exists analytics_dq_events_open_idx on analytics_data_quality_events (org_id, issue_category) where resolved_at is null;
create index if not exists analytics_dq_events_entity_idx on analytics_data_quality_events (entity_type, entity_id);

-- 5.7 Forecasting. New concept entirely (no prior forecast storage existed).
create table if not exists analytics_forecast_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  forecast_type text not null check (forecast_type in (
    'headcount','workforce_cost','turnover','absence','vacancy_demand'
  )),
  method text not null,
  model_version text not null default 'v1-linear-trend',
  source_period_start date not null,
  source_period_end date not null,
  horizon_periods integer not null default 3,
  data_quality_status text not null default 'ok' check (data_quality_status in ('ok','degraded','blocked')),
  data_quality_note text,
  status text not null default 'completed' check (status in ('completed','blocked')),
  limitations text not null default 'Trend-based projection from historical snapshots; not a guarantee of future outcomes and not an automated employment decision.',
  generated_by uuid references app_users(id),
  generated_at timestamptz not null default now()
);

comment on table analytics_forecast_runs is 'Area 10 forecast execution metadata (spec analytics_forecast_runs, §5.4/5.7). Decision support only — §5.8 predictive governance.';

create table if not exists analytics_forecast_results (
  id uuid primary key default gen_random_uuid(),
  forecast_run_id uuid not null references analytics_forecast_runs(id) on delete cascade,
  period_date date not null,
  dimension_key text not null default 'all',
  dimension_value text not null default 'all',
  predicted_value numeric not null,
  lower_bound numeric,
  upper_bound numeric,
  created_at timestamptz not null default now()
);

comment on table analytics_forecast_results is 'Area 10 forecast outputs (spec analytics_forecast_results, §5.4/5.7).';

create index if not exists analytics_forecast_results_run_idx on analytics_forecast_results (forecast_run_id);

-- RLS: mirrors the existing metric_definitions/metric_snapshots pattern
-- (hr/admin only at the table level; manager-safe values are served through
-- server actions that recompute with manager scope applied, same as the
-- existing manager analytics code — never a raw manager SELECT on the
-- registry/snapshot tables, since dimension_value is free text and cannot
-- be safely scoped by RLS alone without a structured org-unit FK).
alter table analytics_dimensions enable row level security;
alter table analytics_data_quality_events enable row level security;
alter table analytics_forecast_runs enable row level security;
alter table analytics_forecast_results enable row level security;

create policy analytics_dimensions_org_read on analytics_dimensions
  for select using (org_id = current_org_id());

create policy analytics_dq_events_hr_all on analytics_data_quality_events
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy analytics_forecast_runs_hr_all on analytics_forecast_runs
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy analytics_forecast_results_hr_read on analytics_forecast_results
  for select using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from analytics_forecast_runs r where r.id = forecast_run_id and r.org_id = current_org_id())
  );
