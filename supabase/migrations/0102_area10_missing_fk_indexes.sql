create index if not exists analytics_dq_events_resolved_by_idx on analytics_data_quality_events (resolved_by) where resolved_by is not null;
create index if not exists analytics_forecast_runs_generated_by_idx on analytics_forecast_runs (generated_by) where generated_by is not null;
create index if not exists analytics_forecast_runs_org_id_idx on analytics_forecast_runs (org_id);
