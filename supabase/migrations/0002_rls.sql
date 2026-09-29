-- Row-Level Security: helper functions + policies

-- ============ HELPER FUNCTIONS ============

create or replace function hrms_current_role() returns user_role as $$
  select role from app_users where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function current_org_id() returns uuid as $$
  select org_id from app_users where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function current_employee_id() returns uuid as $$
  select employee_id from app_users where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function is_manager_of(target_employee_id uuid) returns boolean as $$
  select exists (
    select 1 from employees
    where id = target_employee_id
      and reporting_manager_id = current_employee_id()
  );
$$ language sql stable security definer set search_path = public;

-- ============ ENABLE RLS EVERYWHERE ============

alter table organizations enable row level security;
alter table app_users enable row level security;
alter table employees enable row level security;
alter table employee_audit_log enable row level security;
alter table requisitions enable row level security;
alter table candidates enable row level security;
alter table onboarding_tasks enable row level security;
alter table attendance enable row level security;
alter table leave_requests enable row level security;
alter table leave_policies enable row level security;
alter table statutory_rates enable row level security;
alter table payroll_runs enable row level security;
alter table payslips enable row level security;
alter table salary_advances enable row level security;
alter table appraisals enable row level security;
alter table appraisal_goals enable row level security;
alter table training_courses enable row level security;
alter table training_enrollments enable row level security;
alter table statutory_filing_log enable row level security;
alter table compliance_documents enable row level security;
alter table policies enable row level security;
alter table policy_acknowledgments enable row level security;
alter table offboarding_records enable row level security;
alter table offboarding_assets enable row level security;

-- ============ ORGANIZATIONS ============
-- Everyone in the org can read their own org row; only admin can update.

create policy "org_read_own" on organizations
  for select using (id = current_org_id());

create policy "org_admin_update" on organizations
  for update using (id = current_org_id() and hrms_current_role() = 'admin');

-- ============ APP_USERS ============
-- Admin manages accounts/roles. Everyone can read their own row (needed to bootstrap the UI).

create policy "app_users_admin_full" on app_users
  for all using (hrms_current_role() = 'admin' and org_id = current_org_id());

create policy "app_users_read_self" on app_users
  for select using (id = auth.uid());

-- ============ EMPLOYEES ============

create policy "employees_hr_full" on employees
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "employees_manager_reads_reports" on employees
  for select using (
    hrms_current_role() = 'manager'
    and org_id = current_org_id()
    and (reporting_manager_id = current_employee_id() or id = current_employee_id())
  );

create policy "employees_self_read" on employees
  for select using (id = current_employee_id());

create policy "employees_self_update" on employees
  for update using (id = current_employee_id())
  with check (id = current_employee_id());

-- ============ EMPLOYEE AUDIT LOG ============

create policy "audit_hr_full" on employee_audit_log
  for all using (hrms_current_role() in ('admin','hr'));

-- ============ RECRUITMENT ============

create policy "requisitions_hr_full" on requisitions
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "requisitions_manager_own" on requisitions
  for select using (
    hrms_current_role() = 'manager'
    and org_id = current_org_id()
    and hiring_manager_id = current_employee_id()
  );

create policy "candidates_hr_full" on candidates
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from requisitions r where r.id = requisition_id and r.org_id = current_org_id())
  );

create policy "candidates_manager_read" on candidates
  for select using (
    hrms_current_role() = 'manager'
    and exists (
      select 1 from requisitions r
      where r.id = requisition_id and r.hiring_manager_id = current_employee_id()
    )
  );

create policy "onboarding_tasks_hr_full" on onboarding_tasks
  for all using (hrms_current_role() in ('admin','hr'));

-- ============ ATTENDANCE ============

create policy "attendance_hr_full" on attendance
  for all using (hrms_current_role() in ('admin','hr'));

create policy "attendance_self_read" on attendance
  for select using (employee_id = current_employee_id());

create policy "attendance_self_insert" on attendance
  for insert with check (employee_id = current_employee_id());

create policy "attendance_manager_team_read" on attendance
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

-- ============ LEAVE ============

create policy "leave_hr_full" on leave_requests
  for all using (hrms_current_role() in ('admin','hr'));

create policy "leave_self_read" on leave_requests
  for select using (employee_id = current_employee_id());

create policy "leave_self_insert" on leave_requests
  for insert with check (employee_id = current_employee_id());

create policy "leave_manager_team_read" on leave_requests
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "leave_manager_team_approve" on leave_requests
  for update using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "leave_policies_read_all" on leave_policies
  for select using (org_id = current_org_id());

create policy "leave_policies_hr_write" on leave_policies
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- ============ PAYROLL ============
-- Managers get NO policy on payslips or statutory_rates — deliberate.

create policy "rates_read_all" on statutory_rates
  for select using (org_id = current_org_id());

create policy "rates_hr_write" on statutory_rates
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "payroll_runs_hr_full" on payroll_runs
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "payslips_hr_full" on payslips
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from payroll_runs pr where pr.id = payroll_run_id and pr.org_id = current_org_id())
  );

create policy "payslips_self_read" on payslips
  for select using (employee_id = current_employee_id());

create policy "advances_hr_full" on salary_advances
  for all using (hrms_current_role() in ('admin','hr'));

create policy "advances_self_read" on salary_advances
  for select using (employee_id = current_employee_id());

-- ============ PERFORMANCE ============

create policy "appraisals_hr_full" on appraisals
  for all using (hrms_current_role() in ('admin','hr'));

create policy "appraisals_self_read" on appraisals
  for select using (employee_id = current_employee_id());

create policy "appraisals_self_update_comments" on appraisals
  for update using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id());

create policy "appraisals_manager_team" on appraisals
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "appraisals_manager_update" on appraisals
  for update using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "appraisal_goals_hr_full" on appraisal_goals
  for all using (
    hrms_current_role() in ('admin','hr')
  );

create policy "appraisal_goals_visible_with_parent" on appraisal_goals
  for select using (
    exists (
      select 1 from appraisals a
      where a.id = appraisal_id
        and (
          a.employee_id = current_employee_id()
          or (hrms_current_role() = 'manager' and is_manager_of(a.employee_id))
        )
    )
  );

-- ============ LEARNING & DEVELOPMENT ============

create policy "courses_read_all" on training_courses
  for select using (org_id = current_org_id());

create policy "courses_hr_write" on training_courses
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "enrollments_hr_full" on training_enrollments
  for all using (hrms_current_role() in ('admin','hr'));

create policy "enrollments_self_read" on training_enrollments
  for select using (employee_id = current_employee_id());

create policy "enrollments_self_insert" on training_enrollments
  for insert with check (employee_id = current_employee_id());

create policy "enrollments_manager_team_read" on training_enrollments
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

-- ============ COMPLIANCE ============

create policy "filing_log_hr_full" on statutory_filing_log
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "compliance_docs_hr_full" on compliance_documents
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "policies_read_all" on policies
  for select using (org_id = current_org_id());

create policy "policies_hr_write" on policies
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "policy_acks_hr_full" on policy_acknowledgments
  for all using (hrms_current_role() in ('admin','hr'));

create policy "policy_acks_self" on policy_acknowledgments
  for select using (employee_id = current_employee_id());

create policy "policy_acks_self_insert" on policy_acknowledgments
  for insert with check (employee_id = current_employee_id());

-- ============ OFFBOARDING ============

create policy "offboarding_hr_full" on offboarding_records
  for all using (hrms_current_role() in ('admin','hr'));

create policy "offboarding_assets_hr_full" on offboarding_assets
  for all using (hrms_current_role() in ('admin','hr'));
