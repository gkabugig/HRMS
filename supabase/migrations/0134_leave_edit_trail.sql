-- Leave requests can be edited after submission (even after approval) to
-- cover changes in circumstances. Track who edited and how often so the
-- change is visible, not silent.
alter table leave_requests add column if not exists edited_at timestamptz;
alter table leave_requests add column if not exists edited_by uuid references app_users(id);
alter table leave_requests add column if not exists edit_count int not null default 0;
