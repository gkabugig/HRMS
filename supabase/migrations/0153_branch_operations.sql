-- Branch Operations (StaffTrack): branch clocking kiosks with PIN + live
-- photo, a structured daily report from each branch manager, and the
-- settings the owners' dashboard and WhatsApp alerts run on.
--
-- Trust model, same as the rest of attendance since 0133: the browser never
-- writes clock or report rows. Kiosks are not signed-in users at all - a
-- paired device holds a random token (only its SHA-256 hash is stored here)
-- and every kiosk request is checked and written server-side with the
-- service role. Managers submit reports through a server action that checks
-- they manage that branch. So every new table below has read policies only;
-- there are deliberately no client INSERT/UPDATE/DELETE policies.

-- ---------------------------------------------------------------- settings
create table branch_ops_settings (
  org_id uuid primary key references organizations(id),
  -- Reports submitted after this time (Kenya time, same day) are marked
  -- late. The reminder and summary run on the schedule in vercel.json.
  report_deadline time not null default '22:30',
  cash_variance_threshold numeric(12,2) not null default 500 check (cash_variance_threshold >= 0),
  -- Owners' WhatsApp numbers in international form, e.g. 2547XXXXXXXX.
  owner_whatsapp_numbers text[] not null default '{}',
  photo_retention_days int not null default 90 check (photo_retention_days between 7 and 3650),
  updated_at timestamptz not null default now()
);
alter table branch_ops_settings enable row level security;
create policy branch_ops_settings_hr_read on branch_ops_settings for select
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- Who runs each branch. The manager and deputy can submit its daily report.
alter table branches
  add column if not exists manager_employee_id uuid references employees(id),
  add column if not exists deputy_employee_id uuid references employees(id),
  add column if not exists opening_time time,
  add column if not exists closing_time time;

-- True when the signed-in person manages or deputises for this branch.
create or replace function runs_branch(target_branch_id uuid) returns boolean as $$
  select exists (
    select 1 from branches b
    where b.id = target_branch_id
      and b.org_id = current_org_id()
      and current_employee_id() is not null
      and current_employee_id() in (b.manager_employee_id, b.deputy_employee_id)
  );
$$ language sql stable security definer set search_path = public;
revoke all on function runs_branch(uuid) from public;
grant execute on function runs_branch(uuid) to authenticated;

-- A branch manager can see the attendance and breaks of their branch's staff
-- (read only), so the daily report can show today's register.
create policy attendance_branch_runner_read on attendance for select
  using (exists (select 1 from employees e where e.id = attendance.employee_id and e.branch_id is not null and runs_branch(e.branch_id)));
create policy attendance_breaks_branch_runner_read on attendance_breaks for select
  using (exists (select 1 from employees e where e.id = attendance_breaks.employee_id and e.branch_id is not null and runs_branch(e.branch_id)));

-- ------------------------------------------------------------------ kiosks
create table branch_kiosks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  token_hash text unique,                 -- sha256 of the device cookie token
  pairing_code_hash text,                 -- sha256 of the one-time pairing code
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index branch_kiosks_branch_idx on branch_kiosks(branch_id);
alter table branch_kiosks enable row level security;
create policy branch_kiosks_hr_read on branch_kiosks for select
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- Staff kiosk PINs: salted scrypt hash, never readable from any client.
create table employee_kiosk_pins (
  employee_id uuid primary key references employees(id) on delete cascade,
  org_id uuid not null references organizations(id),
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  set_by uuid references auth.users(id),
  set_at timestamptz not null default now()
);
alter table employee_kiosk_pins enable row level security;
-- No policies: service role only. HR sees "PIN set / not set" through
-- the server, never the hash.

-- Photo and device evidence on each clock event.
alter table attendance
  add column if not exists clock_in_photo_path text,
  add column if not exists clock_out_photo_path text,
  add column if not exists clock_in_kiosk_id uuid references branch_kiosks(id),
  add column if not exists clock_out_kiosk_id uuid references branch_kiosks(id);

alter table attendance_breaks
  add column if not exists start_photo_path text,
  add column if not exists end_photo_path text,
  add column if not exists kiosk_id uuid references branch_kiosks(id);

-- ----------------------------------------------------------- daily reports
create table branch_daily_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  branch_id uuid not null references branches(id),
  report_date date not null,
  version int not null default 1 check (version >= 1),
  is_current boolean not null default true,
  submitted_by_user uuid references auth.users(id),
  submitted_by_employee uuid references employees(id),
  submitted_at timestamptz not null default now(),
  submitted_late boolean not null default false,

  opened_at time,
  closed_at time,
  attendance_remarks jsonb not null default '{}'::jsonb,   -- employee_id -> remark

  phones_units int not null default 0 check (phones_units >= 0),
  phones_value numeric(14,2) not null default 0 check (phones_value >= 0),
  accessories_units int not null default 0 check (accessories_units >= 0),
  accessories_value numeric(14,2) not null default 0 check (accessories_value >= 0),
  services_value numeric(14,2) not null default 0 check (services_value >= 0),
  top_models text,

  pay_cash numeric(14,2) not null default 0 check (pay_cash >= 0),
  pay_mpesa numeric(14,2) not null default 0 check (pay_mpesa >= 0),
  pay_card numeric(14,2) not null default 0 check (pay_card >= 0),
  pay_credit numeric(14,2) not null default 0 check (pay_credit >= 0),
  total_sales numeric(14,2) generated always as (phones_value + accessories_value + services_value) stored,
  total_payments numeric(14,2) generated always as (pay_cash + pay_mpesa + pay_card + pay_credit) stored,

  opening_float numeric(14,2) not null default 0 check (opening_float >= 0),
  cash_banked numeric(14,2) not null default 0 check (cash_banked >= 0),
  banking_reference text,
  petty_cash_total numeric(14,2) not null default 0 check (petty_cash_total >= 0),
  petty_cash_notes text,
  closing_cash numeric(14,2) not null default 0 check (closing_cash >= 0),
  -- Closing cash minus what the till should hold: float + cash taken
  -- - petty cash spent - cash banked. Negative = cash short.
  cash_variance numeric(14,2) generated always as
    (closing_cash - (opening_float + pay_cash - petty_cash_total - cash_banked)) stored,

  stock_received text,
  stock_transferred text,
  returns_warranty text,
  low_stock text,

  walk_ins int check (walk_ins is null or walk_ins >= 0),
  complaints text,
  enquiries text,

  incident_type text not null default 'none' check (incident_type in ('none','theft','damage','security','outage','other')),
  incident_details text,
  remarks text,
  confirmed boolean not null default false check (confirmed),

  unique (branch_id, report_date, version)
);
create unique index branch_daily_reports_one_current on branch_daily_reports(branch_id, report_date) where is_current;
create index branch_daily_reports_org_date_idx on branch_daily_reports(org_id, report_date desc);
alter table branch_daily_reports enable row level security;
create policy branch_daily_reports_hr_read on branch_daily_reports for select
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy branch_daily_reports_runner_read on branch_daily_reports for select
  using (runs_branch(branch_id));

create table branch_report_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  report_id uuid not null references branch_daily_reports(id) on delete cascade,
  kind text not null check (kind in ('bank_slip','receipt','other')),
  storage_path text not null,
  file_name text,
  uploaded_at timestamptz not null default now()
);
create index branch_report_files_report_idx on branch_report_files(report_id);
alter table branch_report_files enable row level security;
create policy branch_report_files_hr_read on branch_report_files for select
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy branch_report_files_runner_read on branch_report_files for select
  using (exists (select 1 from branch_daily_reports r where r.id = branch_report_files.report_id and runs_branch(r.branch_id)));

-- ------------------------------------------------------------------- alerts
-- One row per alert sent, so a job that runs twice never alerts twice.
create table branch_ops_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  branch_id uuid references branches(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  alert_type text not null check (alert_type in ('branch_not_open','late','absent','report_reminder','report_missing','daily_summary','cash_variance','incident')),
  alert_date date not null,
  channel text not null default 'whatsapp',
  delivered boolean not null default false,
  detail text,
  created_at timestamptz not null default now()
);
create unique index branch_ops_alerts_dedupe on branch_ops_alerts(
  org_id, alert_type, alert_date,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
alter table branch_ops_alerts enable row level security;
create policy branch_ops_alerts_hr_read on branch_ops_alerts for select
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- ----------------------------------------------------------------- storage
-- Private buckets. No storage.objects policies: files are written and read
-- only by the server, which hands out short-lived signed URLs after its
-- own access check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kiosk-photos', 'kiosk-photos', false, 1048576, array['image/jpeg']),
  ('branch-report-files', 'branch-report-files', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- -------------------------------------------------------------- navigation
insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role::user_role, r.module_key, true
from organizations o
cross join (values
  ('admin','branch-ops'),('hr','branch-ops'),
  ('manager','branch-report')
) as r(role, module_key)
where exists (select 1 from role_module_permissions rmp where rmp.org_id = o.id)
on conflict (org_id, role, module_key) do nothing;
