-- Performance Insights (spec §8.2) needs to detect a goal with no update
-- for N days — appraisal_goals had no timestamp at all to check that
-- against. Defaulted to created-equivalent (now()) for existing rows,
-- since there's no better historical value to backfill from.
alter table appraisal_goals add column updated_at timestamptz not null default now();
