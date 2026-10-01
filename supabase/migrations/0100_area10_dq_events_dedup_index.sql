-- Prevent duplicate OPEN findings for the same issue/entity when the
-- data-quality scan re-runs (it runs opportunistically on page view, same
-- "no background job runner" pattern as the rest of Area 10/metrics).
create unique index if not exists analytics_dq_events_open_dedup_idx
  on analytics_data_quality_events (org_id, issue_code, entity_type, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'))
  where resolved_at is null;
