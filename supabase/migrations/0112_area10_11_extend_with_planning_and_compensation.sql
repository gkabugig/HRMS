-- Area 10 extension (spec §5.11): these two KPIs were deferred in migration
-- 0099 until Areas 16/17 existed to supply plan/budget data. Both now exist.
insert into metric_definitions (org_id, key, name, description, formula, population, unit, category, owner_role, refresh_frequency, grain, source)
values
  ('00000000-0000-0000-0000-000000000001', 'workforce_plan_variance', 'Workforce Plan Variance',
   'How far actual active headcount is from the sum of planned headcount across all currently-active workforce plans.',
   '(actual_active_headcount - planned_headcount) / planned_headcount * 100',
   'Active workforce_plans covering today, summed planned_headcount across their lines', 'percent', 'planning', 'hr', 'daily', 'organisation', 'Area 16 workforce_plans/workforce_plan_lines'),
  ('00000000-0000-0000-0000-000000000001', 'compensation_budget_variance', 'Compensation Budget Variance',
   'How far current gross payroll cost is from the sum of approved compensation budgets covering today.',
   '(payroll_cost_gross - budgeted_amount) / budgeted_amount * 100',
   'compensation_budgets rows covering today', 'percent', 'cost', 'hr', 'daily', 'organisation', 'Area 17 compensation_budgets');

-- Area 11 extension (spec §6.7): both rules were seeded inactive pending
-- these exact tables. Now wired in run-risk-scan.ts.
update workforce_risk_rules
set is_active = true,
    threshold_config = jsonb_build_object('max_age_days', 30, 'source', 'Area 16 vacancies.opened_at')
where code = 'POS-VAC-001';

update workforce_risk_rules
set is_active = true,
    threshold_config = jsonb_build_object('source', 'Area 17 compensation_bands vs employees.basic')
where code = 'COMP-001';
