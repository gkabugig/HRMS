-- Calibration sessions (rewards module, phase 5). HR opens a session for a
-- cycle, applies agreed changes with a reason each, and closing it stores the
-- before and after rating distributions and moves the cycle to Approval.

create table calibration_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  cycle_id uuid not null references reward_cycles(id) on delete cascade,
  status text not null default 'Open' check (status in ('Open','Closed')),
  participants jsonb not null default '[]'::jsonb,
  before_dist jsonb,
  after_dist jsonb,
  decisions jsonb not null default '[]'::jsonb,
  opened_by uuid references app_users(id),
  closed_by uuid references app_users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index calibration_sessions_cycle_idx on calibration_sessions(cycle_id);
-- One open session per cycle.
create unique index calibration_sessions_one_open on calibration_sessions(cycle_id) where status = 'Open';

alter table calibration_sessions enable row level security;
create policy calibration_sessions_hr on calibration_sessions for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
