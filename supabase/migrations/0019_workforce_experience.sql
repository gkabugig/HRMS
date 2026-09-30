-- Workforce Experience 2.0: Leave Calendar, Attendance Command Centre,
-- Global Search, Notifications, Responsive/Mobile (see
-- HRMS_Leave_Attendance_Search_Notifications_Mobile_Build_Specification.docx).
-- Per the spec's own instruction ("inspect the existing schema... extend an
-- existing table when it already represents the required source of
-- truth"): leave_requests, leave_policies, attendance, employees and
-- role_module_permissions are reused unchanged. Global Search needs no new
-- tables at all (it queries existing tables through the signed-in user's
-- own RLS-scoped session). What's genuinely missing is added below:
-- notifications, per-user delivery preferences, an auditable attendance
-- correction trail, a lightweight domain-event log, org public holidays and
-- a per-org minimum-staffing setting for the leave conflict engine.

-- ============ NOTIFICATIONS ============

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  recipient_user_id uuid not null references app_users(id) on delete cascade,
  type text not null,
  category text not null check (category in
    ('leave','attendance','payroll','compliance','training','performance','recruitment','offboarding','documents','system')),
  priority text not null check (priority in ('critical','action_required','reminder','information')),
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  action_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  -- Dedupe key for reminder-type notifications materialised on read (e.g.
  -- "contract expiring") so re-checking on every panel open never creates
  -- duplicates. type/entity pairs for one-off event notifications are
  -- unique per occurrence in practice (a new leave request gets a new id).
  unique (recipient_user_id, type, entity_type, entity_id)
);

create index idx_notifications_recipient on notifications(recipient_user_id, is_read, created_at desc);
create index idx_notifications_org on notifications(org_id);
alter table notifications enable row level security;

create policy "notifications_self_read" on notifications
  for select using (recipient_user_id = auth.uid());

create policy "notifications_self_update" on notifications
  for update using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create policy "notifications_self_delete" on notifications
  for delete using (recipient_user_id = auth.uid());

-- Notifications are created by the server action behind whatever business
-- event triggered them (leave submitted, correction made, exception
-- detected) running as the acting user's own session, not a service role —
-- so an insert policy is required. Scoped to "same org, recipient is a real
-- org member" rather than "recipient = self" because most notifications are
-- for someone else (the approver, the employee whose request was decided).
create policy "notifications_org_insert" on notifications
  for insert with check (
    org_id = current_org_id()
    and exists (select 1 from app_users au where au.id = recipient_user_id and au.org_id = current_org_id())
  );

create table notification_preferences (
  user_id uuid not null references app_users(id) on delete cascade,
  notification_type text not null check (notification_type in
    ('leave','attendance','payroll','compliance','training','performance','recruitment','offboarding','documents','system')),
  in_app boolean not null default true,
  email boolean not null default false,
  sms boolean not null default false,
  push boolean not null default false,
  digest_mode text not null default 'instant' check (digest_mode in ('instant','daily','off')),
  primary key (user_id, notification_type)
);

alter table notification_preferences enable row level security;

create policy "notification_prefs_self_full" on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ DOMAIN EVENTS (shared audit/event source, spec §29) ============

create table domain_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  actor_id uuid references app_users(id),
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index idx_domain_events_org on domain_events(org_id, created_at desc);
alter table domain_events enable row level security;

create policy "domain_events_hr_read" on domain_events
  for select using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "domain_events_org_insert" on domain_events
  for insert with check (org_id = current_org_id());

-- ============ ATTENDANCE CORRECTIONS (spec §11: controlled edits with an audit trail) ============

create table attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references attendance(id) on delete set null,
  employee_id uuid not null references employees(id),
  work_date date not null,
  field text not null check (field in ('clock_in','clock_out')),
  original_value text,
  corrected_value text not null,
  reason text not null,
  actor_id uuid references app_users(id),
  payroll_impact boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_attendance_corrections_employee on attendance_corrections(employee_id, work_date);
alter table attendance_corrections enable row level security;

create policy "attendance_corrections_hr_full" on attendance_corrections
  for all using (hrms_current_role() in ('admin','hr'));

create policy "attendance_corrections_manager_team" on attendance_corrections
  for all using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "attendance_corrections_self_read" on attendance_corrections
  for select using (employee_id = current_employee_id());

-- ============ LEAVE CALENDAR SUPPORT (spec §5, §32) ============

create table public_holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  holiday_date date not null,
  name text not null,
  unique (org_id, holiday_date)
);

alter table public_holidays enable row level security;

create policy "public_holidays_read_all" on public_holidays
  for select using (org_id = current_org_id());

create policy "public_holidays_hr_write" on public_holidays
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create table leave_calendar_settings (
  org_id uuid primary key references organizations(id),
  minimum_staffing_pct numeric(5,2) not null default 70,
  updated_at timestamptz not null default now()
);

alter table leave_calendar_settings enable row level security;

create policy "leave_calendar_settings_read_all" on leave_calendar_settings
  for select using (org_id = current_org_id());

create policy "leave_calendar_settings_hr_write" on leave_calendar_settings
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- ============ PERFORMANCE (spec §34: indexed columns) ============

create index if not exists idx_leave_requests_employee_status on leave_requests(employee_id, status);
create index if not exists idx_attendance_employee_date on attendance(employee_id, work_date);
