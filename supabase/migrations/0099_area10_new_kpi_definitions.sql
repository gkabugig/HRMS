-- Area 10 §5.3 core KPIs not yet in the registry. Workforce Plan Variance
-- and Compensation Budget Variance are deferred until Areas 16/17 land
-- authoritative data (spec §5.11: "extend KPI definitions as Areas 16 and
-- 17 become authoritative sources").
insert into metric_definitions (org_id, key, name, description, formula, population, exclusions, unit, category, owner_role, refresh_frequency, grain, required_permission, source)
select '00000000-0000-0000-0000-000000000001', v.key, v.name, v.description, v.formula, v.population, v.exclusions, v.unit, v.category, v.owner_role, v.refresh_frequency, v.grain, v.required_permission, v.source
from (values
  ('fte', 'FTE (Full-Time Equivalent)', 'Effective full-time-equivalent workforce.', 'sum(employment_fraction) over active employees, where full-time = 1.0 and part-time/contract use their configured fraction', 'Active employees at point in time', null, 'ratio', 'headcount', 'hr', 'daily', 'organisation', 'analytics:read', 'employees'),
  ('vacancy_rate', 'Vacancy Rate', 'Approved unfilled positions divided by approved establishment.', 'count(positions where status=vacant and is_active) / count(positions where is_active)', 'Active positions', 'Frozen/closed positions', 'percent', 'planning', 'hr', 'daily', 'organisation', 'analytics:read', 'positions'),
  ('overtime_hours', 'Overtime Hours', 'Approved overtime volume for the period.', 'sum(approved overtime hours) over the period', 'Employees with approved overtime in period', 'Unapproved/pending overtime', 'count', 'attendance', 'hr', 'daily', 'organisation', 'analytics:read', 'attendance_records'),
  ('approval_ageing', 'Approval Ageing', 'Average age in days of outstanding approval items.', 'avg(now() - requested_at) over open approval_requests', 'Open approval requests', 'Completed/cancelled approvals', 'days', 'workflow', 'hr', 'daily', 'organisation', 'analytics:read', 'approval_requests'),
  ('case_sla_compliance', 'Case SLA Compliance', 'HR cases meeting their configured service SLA.', 'count(cases resolved within sla) / count(cases with an sla)', 'HR service cases with a configured SLA', 'Cases without a configured SLA', 'percent', 'service', 'hr', 'daily', 'organisation', 'analytics:read', 'service_requests')
) as v(key, name, description, formula, population, exclusions, unit, category, owner_role, refresh_frequency, grain, required_permission, source)
on conflict (org_id, key) do nothing;
