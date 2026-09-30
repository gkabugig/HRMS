-- Seeds the five priority workflow definitions (Phase 2 spec §20, "hard
-- wired, not configurable" per the confirmed foundation-first scope) and
-- the HR service catalogue (spec §9.1) for every existing org, so the
-- server-action hooks (start-workflow-run.ts) and the Service Centre have
-- something to attach runs/requests to from day one.

insert into workflow_definitions (org_id, key, name, trigger_event, active)
select o.id, w.key, w.name, w.trigger_event, true
from organizations o
cross join (values
  ('employee_onboarding', 'New Employee Onboarding', 'employee.created'),
  ('leave_approval', 'Leave Approval', 'leave.requested'),
  ('contract_renewal', 'Contract Renewal', 'contract.expiring'),
  ('employee_data_change', 'Employee Data Change', 'profile_change.requested'),
  ('offboarding', 'Offboarding', 'offboarding.initiated')
) as w(key, name, trigger_event)
on conflict (org_id, key) do nothing;

insert into service_catalogue (org_id, category, label, description, default_sla_hours)
select o.id, c.category, c.label, c.description, c.sla
from organizations o
cross join (values
  ('Payroll', 'Payroll query', 'Question about a payslip, deduction, or payment.', 48),
  ('Leave', 'Leave issue', 'Problem with a leave balance, request, or approval.', 48),
  ('Attendance', 'Attendance correction', 'Missing or incorrect clock-in/out needing a fix.', 24),
  ('Documents', 'Employment letter request', 'Reference letter, employment confirmation, etc.', 72),
  ('Documents', 'Contract or document request', 'A copy of a contract or other HR document.', 72),
  ('Personal details', 'Personal details change', 'Update to contact info, bank details, or next of kin.', 48),
  ('Benefits', 'Benefits query', 'Question about statutory or company benefits.', 72),
  ('Training', 'Training request', 'Request to attend or be enrolled in training.', 120),
  ('Employee relations', 'Employee relations / HR concern', 'A workplace concern raised with HR.', 24),
  ('Onboarding', 'Onboarding support', 'Help with something related to starting a new role.', 24),
  ('Offboarding', 'Offboarding support', 'Help with something related to leaving the organisation.', 48),
  ('General', 'General HR enquiry', 'Anything else for the HR team.', 72)
) as c(category, label, description, sla);
