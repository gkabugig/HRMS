-- Removes everything demo_data.sql added (rows whose id starts "de000000-"). Nothing else is touched.
delete from attendance where employee_id::text like 'de000000-%';
delete from leave_requests where employee_id::text like 'de000000-%';
delete from timesheets where employee_id::text like 'de000000-%';
delete from checklist_items where employee_id::text like 'de000000-%';
delete from wellbeing_checkins where employee_id::text like 'de000000-%';
delete from wellbeing_resources where id::text like 'de000000-%';
delete from surveys where id::text like 'de000000-%';
delete from succession_plans where id::text like 'de000000-%';
delete from branch_staffing_rules where id::text like 'de000000-%';
delete from announcements where id::text like 'de000000-%';
delete from org_events where id::text like 'de000000-%';
delete from employees where id::text like 'de000000-%';
delete from branches where id::text like 'de000000-%';
