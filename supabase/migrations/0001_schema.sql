-- HRMS core schema
-- Order matters: enums and referenced tables before the tables that use them.

-- ============ EXTENSIONS ============
create extension if not exists pgcrypto;

-- ============ ORGANIZATIONS ============

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ============ ENUMS ============

create type user_role as enum ('admin', 'hr', 'manager', 'employee');
create type employment_type as enum ('Permanent', 'Contract', 'Casual', 'Intern');
create type employee_status as enum ('Active', 'Terminated');
create type requisition_status as enum ('Open', 'Closed');
create type candidate_stage as enum ('Screened','Shortlisted','Interviewed','Offered','Hired','Rejected');
create type leave_type as enum ('Annual','Sick','Compassionate','Maternity','Paternity','Unpaid','Study');
create type leave_status as enum ('Pending','Approved','Rejected');
create type appraisal_status as enum ('In Progress', 'Completed');
create type enrollment_status as enum ('Enrolled', 'Completed');
create type exit_type as enum ('Resignation','Termination','Redundancy','End of Contract','Retirement');
create type offboarding_status as enum ('In Progress', 'Completed');

-- ============ CORE EMPLOYEE DATA ============

create table employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  staff_no text not null,
  name text not null,
  department text not null,
  job_title text not null,
  employment_type employment_type not null default 'Permanent',
  date_of_hire date not null,
  reporting_manager_id uuid references employees(id),
  basic numeric(12,2) not null default 0,
  house_allowance numeric(12,2) not null default 0,
  transport_allowance numeric(12,2) not null default 0,
  other_allowance numeric(12,2) not null default 0,
  other_deductions numeric(12,2) not null default 0,
  kra_pin text,
  nssf_no text,
  shif_no text,
  status employee_status not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, staff_no)
);

-- ============ APP USERS (auth.users -> role/employee mapping) ============

create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id),
  role user_role not null default 'employee',
  employee_id uuid references employees(id),
  created_at timestamptz not null default now()
);

-- Audit trail: every change to an employee record
create table employee_audit_log (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now(),
  field text not null,
  old_value text,
  new_value text
);

-- ============ RECRUITMENT & ONBOARDING ============

create table requisitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  role text not null,
  department text not null,
  hiring_manager_id uuid references employees(id),
  headcount int not null default 1,
  status requisition_status not null default 'Open',
  raised_on timestamptz not null default now()
);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references requisitions(id) on delete cascade,
  name text not null,
  source text,
  stage candidate_stage not null default 'Screened',
  employee_id uuid references employees(id),
  added_on timestamptz not null default now()
);

create table onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  task text not null,
  done boolean not null default false,
  done_at timestamptz
);

-- ============ ATTENDANCE ============

create table attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  work_date date not null,
  clock_in time,
  clock_out time,
  source text default 'manual',
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

-- ============ LEAVE ============

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  leave_type leave_type not null,
  start_date date not null,
  end_date date not null,
  days int not null,
  reason text,
  status leave_status not null default 'Pending',
  approved_by uuid references app_users(id),
  applied_on timestamptz not null default now(),
  decided_on timestamptz
);

create table leave_policies (
  org_id uuid not null references organizations(id),
  leave_type leave_type not null,
  annual_entitlement_days int not null,
  primary key (org_id, leave_type)
);

-- ============ PAYROLL ============

create table statutory_rates (
  org_id uuid not null references organizations(id),
  effective_from date not null,
  paye_bands jsonb not null,
  personal_relief numeric(10,2) not null,
  nssf_tier1_ceiling numeric(10,2) not null,
  nssf_tier2_ceiling numeric(10,2) not null,
  nssf_rate numeric(5,4) not null,
  shif_rate numeric(5,4) not null,
  shif_min numeric(10,2) not null,
  housing_levy_rate numeric(5,4) not null,
  primary key (org_id, effective_from)
);

create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  period text not null,
  generated_by uuid references app_users(id),
  generated_at timestamptz not null default now(),
  unique (org_id, period)
);

create table payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id),
  gross numeric(12,2) not null,
  nssf numeric(12,2) not null,
  shif numeric(12,2) not null,
  housing_levy numeric(12,2) not null,
  paye numeric(12,2) not null,
  other_deductions numeric(12,2) not null default 0,
  net numeric(12,2) not null,
  employer_nssf numeric(12,2) not null,
  employer_housing_levy numeric(12,2) not null
);

-- Salary advances (carried over from the client-side prototype)
create table salary_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  amount numeric(12,2) not null,
  monthly_repayment numeric(12,2) not null,
  balance numeric(12,2) not null,
  issued_on date not null default current_date,
  status text not null default 'Active',
  created_by uuid references app_users(id)
);

-- ============ PERFORMANCE ============

create table appraisals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  cycle text not null,
  status appraisal_status not null default 'In Progress',
  self_comments text,
  manager_comments text,
  final_score numeric(3,2),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table appraisal_goals (
  id uuid primary key default gen_random_uuid(),
  appraisal_id uuid not null references appraisals(id) on delete cascade,
  goal_text text not null,
  weight int not null check (weight between 0 and 100),
  self_rating int check (self_rating between 1 and 5),
  manager_rating int check (manager_rating between 1 and 5)
);

-- ============ LEARNING & DEVELOPMENT ============

create table training_courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  provider text,
  mode text,
  duration text,
  cost numeric(12,2) default 0,
  mandatory boolean not null default false,
  validity_months int
);

create table training_enrollments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  course_id uuid not null references training_courses(id),
  status enrollment_status not null default 'Enrolled',
  enrolled_on date not null default current_date,
  completed_on date,
  certificate_note text
);

-- ============ COMPLIANCE ============

create table statutory_filing_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  filing_key text not null,
  period text not null,
  filed_on date not null default current_date,
  filed_by uuid references app_users(id),
  unique (org_id, filing_key, period)
);

create table compliance_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid references employees(id),
  doc_type text not null,
  label text not null,
  expiry_date date not null,
  alert_threshold_days int not null default 30,
  notes text
);

create table policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  version text,
  published_on date not null
);

create table policy_acknowledgments (
  policy_id uuid not null references policies(id) on delete cascade,
  employee_id uuid not null references employees(id),
  acked_on date not null default current_date,
  primary key (policy_id, employee_id)
);

-- ============ OFFBOARDING ============

create table offboarding_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  exit_type exit_type not null,
  notice_date date not null,
  last_working_day date not null,
  exit_interview_completed boolean not null default false,
  exit_interview_notes text,
  pro_rated_days int not null default 0,
  other_deductions numeric(12,2) not null default 0,
  statutory_deregistered boolean not null default false,
  status offboarding_status not null default 'In Progress',
  initiated_by uuid references app_users(id),
  initiated_on timestamptz not null default now(),
  completed_on timestamptz
);

create table offboarding_assets (
  id uuid primary key default gen_random_uuid(),
  offboarding_id uuid not null references offboarding_records(id) on delete cascade,
  item text not null,
  returned boolean not null default false
);
