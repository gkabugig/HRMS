-- Seeds the AI model registry (spec §11 — no production AI feature should
-- run on an untracked version) and the canonical metric definitions for
-- the Workforce Analytics dashboards (spec §4.1/§4.2), for every existing
-- org.

insert into ai_models (org_id, key, name, kind, provider, version, status, purpose, owner_role)
select o.id, m.key, m.name, m.kind, 'rule-based', m.version, 'active', m.purpose, 'admin'
from organizations o
cross join (values
  ('payroll-anomaly-detector', 'Payroll Anomaly Detector', 'anomaly_detection', 'v1', 'Statistical + deterministic scan of a payroll run against employee/department baselines and approved-change context before approval.'),
  ('performance-insight-generator', 'Performance Insight Generator', 'insight_generation', 'v1', 'Evidence-linked coaching insights derived from goal status, appraisal ratings and review completion — never a personality or health inference.'),
  ('workforce-metric-engine', 'Workforce Metric Engine', 'insight_generation', 'v1', 'Computes and snapshots the canonical KPI set behind the Workforce Analytics dashboards.')
) as m(key, name, kind, version, purpose)
on conflict (org_id, key, version) do nothing;

insert into metric_definitions (org_id, key, name, description, formula, population, exclusions, unit, category, owner_role, refresh_frequency)
select o.id, d.key, d.name, d.description, d.formula, d.population, d.exclusions, d.unit, d.category, 'hr', 'on_demand'
from organizations o
cross join (values
  ('headcount_active', 'Active headcount', 'Employees currently active.', 'count(employees where status = Active)', 'All employees', null, 'count', 'headcount'),
  ('headcount_new_hires', 'New hires (period)', 'Employees whose hire date falls in the selected period.', 'count(employees where date_of_hire between period start/end)', 'All employees', null, 'count', 'headcount'),
  ('headcount_exits', 'Exits (period)', 'Completed offboardings in the selected period.', 'count(offboarding_records where status = Completed and last_working_day in period)', 'All employees', null, 'count', 'headcount'),
  ('turnover_rate', 'Turnover rate', 'Exits in period divided by average headcount in period.', 'exits / avg(opening headcount, closing headcount)', 'All employees', 'Casuals under 30 days engagement', 'percent', 'headcount'),
  ('payroll_cost_gross', 'Payroll cost (gross)', 'Total gross pay for the latest closed payroll run.', 'sum(payslips.gross) for latest run where status in (paid, closed)', 'All payslips in the run', null, 'currency', 'cost'),
  ('payroll_cost_per_employee', 'Cost per employee', 'Average gross pay per employee for the latest closed payroll run.', 'payroll_cost_gross / count(payslips)', 'All payslips in the run', null, 'currency', 'cost'),
  ('attendance_presence_rate', 'Presence rate', 'Share of expected working days with a recorded clock-in, trailing 30 days.', 'present days / expected working days', 'Employees with attendance records', 'Approved leave days', 'percent', 'attendance'),
  ('attendance_lateness_rate', 'Lateness rate', 'Share of clock-ins flagged late, trailing 30 days.', 'late clock-ins / total clock-ins', 'Employees with attendance records', null, 'percent', 'attendance'),
  ('leave_utilisation', 'Leave utilisation', 'Annual leave days taken as a share of accrued entitlement, current year.', 'days taken / days accrued', 'Employees with an annual leave entitlement', null, 'percent', 'leave'),
  ('recruitment_open_roles', 'Open roles', 'Requisitions currently open.', 'count(requisitions where status = Open)', 'All requisitions', null, 'count', 'recruitment'),
  ('recruitment_time_to_fill', 'Time to fill (days)', 'Average days from requisition approval to hire, filled roles in period.', 'avg(hire_date - approved_at)', 'Requisitions filled in period', null, 'days', 'recruitment'),
  ('performance_goal_completion', 'Goal completion rate', 'Share of active appraisal goals rated complete/on-track for the current cycle.', 'goals with manager_rating >= 4 / total active goals', 'Appraisal goals in the current cycle', null, 'percent', 'performance'),
  ('performance_appraisal_completion', 'Appraisal completion rate', 'Share of appraisals in the current cycle marked Completed.', 'count(appraisals where status = Completed) / count(appraisals)', 'Appraisals in the current cycle', null, 'percent', 'performance'),
  ('learning_completion_rate', 'Training completion rate', 'Share of training enrollments marked complete.', 'count(enrollments where completed) / count(enrollments)', 'All training enrollments', null, 'percent', 'learning'),
  ('compliance_expiring_documents', 'Expiring compliance documents', 'Compliance documents expiring within 60 days.', 'count(compliance_documents where expiry_date <= current_date + 60)', 'All compliance documents', null, 'count', 'compliance')
) as d(key, name, description, formula, population, exclusions, unit, category)
on conflict (org_id, key) do nothing;
