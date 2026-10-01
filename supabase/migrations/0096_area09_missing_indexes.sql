-- Performance advisor flagged these unindexed FKs after Area 09's schema
-- additions. escalated_from_id is a genuine hot path (escalation.ts's
-- loop-prevention check runs this lookup once per candidate notification
-- on every escalation sweep); the others are cheap to add and avoid a
-- sequential scan as these tables grow.
create index if not exists notifications_escalated_from_id_idx on public.notifications (escalated_from_id) where escalated_from_id is not null;
create index if not exists notification_dead_letters_notification_id_idx on public.notification_dead_letters (notification_id) where notification_id is not null;
