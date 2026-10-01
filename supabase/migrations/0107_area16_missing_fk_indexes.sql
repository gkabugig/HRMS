-- Performance-advisor findings on the new Area 16 tables: missing FK
-- indexes, same pattern as migration 0102 for Area 10.
create index positions_cost_centre_id_idx on positions(cost_centre_id);
create index positions_location_id_idx on positions(location_id);
create index positions_position_type_id_idx on positions(position_type_id);
create index positions_reports_to_position_id_idx on positions(reports_to_position_id);

create index position_budgets_cost_centre_id_idx on position_budgets(cost_centre_id);
create index position_budgets_org_id_idx on position_budgets(org_id);
create index position_events_actor_user_id_idx on position_events(actor_user_id);
create index position_events_org_id_idx on position_events(org_id);
create index position_requests_approval_request_id_idx on position_requests(approval_request_id);
create index position_requests_requested_by_idx on position_requests(requested_by);
create index position_versions_changed_by_idx on position_versions(changed_by);
create index position_versions_org_id_idx on position_versions(org_id);
create index vacancies_filled_by_employee_id_idx on vacancies(filled_by_employee_id);
create index vacancies_requisition_id_idx on vacancies(requisition_id);
create index workforce_plan_lines_org_id_idx on workforce_plan_lines(org_id);
create index workforce_plan_lines_position_type_id_idx on workforce_plan_lines(position_type_id);
create index workforce_plans_approval_request_id_idx on workforce_plans(approval_request_id);
create index workforce_plans_org_id_idx on workforce_plans(org_id);
create index workforce_plans_owner_user_id_idx on workforce_plans(owner_user_id);
create index workforce_scenario_lines_org_id_idx on workforce_scenario_lines(org_id);
create index workforce_scenario_lines_position_type_id_idx on workforce_scenario_lines(position_type_id);
create index workforce_scenarios_base_plan_id_idx on workforce_scenarios(base_plan_id);
create index workforce_scenarios_created_by_idx on workforce_scenarios(created_by);
create index workforce_scenarios_org_id_idx on workforce_scenarios(org_id);
