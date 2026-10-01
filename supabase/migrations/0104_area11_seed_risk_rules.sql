-- Area 11 §6.7 initial rule catalogue. is_active=true for rules the engine
-- (run-risk-scan.ts) actually evaluates; is_active=false rules are recorded
-- per the spec's table but not yet wired (disclosed reasons in column
-- threshold_config->>'deferred_reason'):
--   DOC-MISS-001 / ACK scope note: no per-org config of which document
--     types are mandatory for all employees exists yet.
--   CONTRACT-EXP-001: employees has no contract end-date field (only
--     contract_issued_on) for fixed-term contracts.
--   POS-VAC-001: positions has no "became vacant at" timestamp yet
--     (lands naturally with Area 16's vacancies table).
--   COMP-001: depends on Area 17 compensation bands, which don't exist yet.
--   INTEGRATION-001: no external HR integration exists in this build to
--     monitor for failures.
insert into workforce_risk_rules (org_id, code, name, description, category, default_impact_weight, default_likelihood_weight, default_urgency_weight, default_confidence_weight, threshold_config, is_active)
select '00000000-0000-0000-0000-000000000001', v.code, v.name, v.description, v.category, v.impact, v.likelihood, v.urgency, v.confidence, v.threshold_config::jsonb, v.is_active
from (values
  ('DOC-EXP-001', 'Required document nearing expiry', 'A compliance document is within its configured alert window of expiry.', 'document', 0.6, 0.8, 0.6, 0.9, '{"source": "compliance_documents"}', true),
  ('DOC-MISS-001', 'Required document missing', 'An employee is missing a document their org has marked mandatory.', 'compliance', 0.7, 0.5, 0.5, 0.5, '{"deferred_reason": "no mandatory-document-type configuration exists yet"}', false),
  ('CONTRACT-EXP-001', 'Contract nearing expiry', 'A fixed-term employment contract is approaching its end date.', 'employment_lifecycle', 0.7, 0.6, 0.6, 0.5, '{"deferred_reason": "employees has no contract end-date field"}', false),
  ('PROBATION-001', 'Probation overdue', 'An employee''s probation period has ended without a recorded confirmation decision.', 'employment_lifecycle', 0.6, 0.7, 0.7, 0.9, '{"source": "employees.probation_end_date"}', true),
  ('APPROVAL-001', 'Approval exceeds SLA', 'An approval request has been open longer than its configured SLA.', 'workflow', 0.5, 0.7, 0.7, 0.9, '{"source": "approval_requests", "stale_days": 7}', true),
  ('CASE-SLA-001', 'HR case SLA breached', 'An HR service case has passed its configured SLA due date unresolved.', 'hr_service', 0.5, 0.7, 0.8, 0.9, '{"source": "service_requests"}', true),
  ('POS-VAC-001', 'Approved vacancy exceeds age threshold', 'A vacant position has been open longer than the configured threshold.', 'workforce_planning', 0.6, 0.6, 0.5, 0.6, '{"deferred_reason": "positions has no vacancy-opened-at timestamp; lands with Area 16 vacancies"}', false),
  ('DATA-MGR-001', 'Employee has no valid manager', 'An active employee has no reporting manager on record.', 'data_quality', 0.5, 0.6, 0.4, 0.95, '{"source": "analytics_data_quality_events:missing_manager"}', true),
  ('DATA-POS-001', 'Employee linked to invalid position', 'An employee is assigned to an inactive or invalid position.', 'data_quality', 0.5, 0.5, 0.4, 0.95, '{"source": "analytics_data_quality_events:inactive_position_assignment"}', true),
  ('OT-001', 'Overtime exceeds configured threshold', 'Recorded overtime volume has exceeded the configured organisational threshold.', 'operational', 0.5, 0.6, 0.5, 0.6, '{"source": "metric:overtime_hours", "threshold_hours": 40}', true),
  ('COMP-001', 'Compensation outside approved band', 'An employee''s compensation falls outside their grade''s approved band.', 'compensation_control', 0.8, 0.5, 0.6, 0.7, '{"deferred_reason": "Area 17 compensation bands do not exist yet"}', false),
  ('ACK-001', 'Mandatory acknowledgement overdue', 'A required document acknowledgement has not been completed within the configured window.', 'compliance', 0.6, 0.6, 0.6, 0.9, '{"source": "document_acknowledgements", "overdue_days": 14}', true),
  ('INTEGRATION-001', 'Critical HR integration failure', 'A critical external HR system integration has failed.', 'operational', 0.7, 0.3, 0.8, 0.5, '{"deferred_reason": "no external HR integration exists in this build"}', false)
) as v(code, name, description, category, impact, likelihood, urgency, confidence, threshold_config, is_active)
on conflict (org_id, code) do nothing;
