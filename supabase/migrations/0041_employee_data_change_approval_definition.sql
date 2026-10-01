-- Universal Approval Engine — Employee Data Change migrated onto the
-- definition-driven engine (Area 02 spec §9/§19.L: "Employee Data Change:
-- Already uses generic approval → Standardise on universal engine").
--
-- The actual decision chain is unchanged (a single HR step) — what changes
-- is that it's now driven by a versioned approval_definitions row through
-- resolveApprover()/startApproval() instead of a hardcoded
-- `steps: [{ approverRole: "hr" }]` array in profile-change-actions.ts, so
-- the same resolver/condition/delegation/escalation machinery future
-- integrations (Leave, Payroll, ...) will use is proven end-to-end on a
-- real, already-working path first.
--
-- One org exists in this deployment today (00000000-0000-0000-0000-000000000001);
-- seeded directly rather than building a new-org provisioning flow, matching
-- how Area 01's RBAC roles were seeded for existing orgs in 0034.
insert into public.approval_definitions (org_id, code, name, resource, version, is_active, auto_start)
values ('00000000-0000-0000-0000-000000000001', 'employee_data_change', 'Employee Data Change', 'employee_data_change', 1, true, true)
on conflict (org_id, code, version) do nothing;

insert into public.approval_definition_steps (definition_id, step_order, name, approver_type, required, allow_delegate, allow_escalation, sla_hours)
select d.id, 1, 'HR review', 'HR_ROLE', true, true, true, 48
from public.approval_definitions d
where d.org_id = '00000000-0000-0000-0000-000000000001' and d.code = 'employee_data_change' and d.version = 1
on conflict (definition_id, step_order) do nothing;
