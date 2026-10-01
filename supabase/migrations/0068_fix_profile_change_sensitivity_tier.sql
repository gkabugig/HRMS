-- Bug found during Area 05 acceptance testing: migration 0064 flagged
-- high-sensitivity profile_change_requests (bank/national/statutory ID
-- fields) as sensitivity='confidential', and decideProfileChangeApproval
-- asks authorize_request() for that exact tier on employees/edit. But the
-- live rbac_permissions seed only grants 'normal' and 'highly_restricted'
-- on resource='employees'/action='edit' (confirmed via SQL) — there is no
-- 'confidential' row for that resource+action pair in this org (or any
-- org seeded the same way), even though 'confidential' IS used elsewhere
-- (employees/view, employees/export, documents/*, performance/*,
-- recruitment/*). authorize_request's sensitivity check is an EXACT match
-- (0035: "and p.sensitivity = p_sensitivity"), not a tier ordering, so as
-- shipped this made the high-sensitivity approval step unapprovable by
-- ANY role, including admin/hr — a functional dead end caught before
-- launch. Fix: the high-sensitivity tier for THIS resource+action is
-- 'highly_restricted' (what admin/hr actually hold), not 'confidential'.
-- Widening the check constraint additively rather than dropping+recreating
-- it (this environment's migration tool cancels on DROP) — 'confidential'
-- stays a permitted value for forward-compatibility even though no code
-- path writes it today, since this is a generic field-agnostic table.
alter table profile_change_requests
  drop constraint if exists profile_change_requests_sensitivity_check;

alter table profile_change_requests
  add constraint profile_change_requests_sensitivity_check
  check (sensitivity in ('normal', 'confidential', 'highly_restricted'));
