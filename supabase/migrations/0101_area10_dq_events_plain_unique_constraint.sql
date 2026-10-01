-- See 0100: a partial unique index's predicate can't be targeted by a plain
-- PostgREST upsert's ON CONFLICT (column list) without a matching WHERE
-- clause, which the client library does not emit. Add a plain unique
-- constraint instead; the old partial index (if still present) is now
-- redundant but harmless to leave in place. A plain constraint also gives
-- better semantics: when the scan re-detects a previously resolved issue
-- recurring, it reopens the same row (resolved_at -> null, refreshed
-- description/details) rather than creating a parallel row.
alter table analytics_data_quality_events
  add constraint analytics_dq_events_natural_key unique (org_id, issue_code, entity_type, entity_id);
