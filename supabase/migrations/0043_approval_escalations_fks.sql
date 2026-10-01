-- approval_escalations.from_approver_id/to_approver_id were left as bare
-- uuid columns in 0039 (no FK target existed at authoring time — either
-- could be null, e.g. a role-assigned step has no specific
-- from_approver_id). Add the foreign keys now so PostgREST can embed
-- app_users (and from there, employees.name) directly in a query, which
-- the new Approvals Centre detail page (Task #23) relies on for rendering
-- "escalated from X to Y" in plain names instead of raw ids.
alter table public.approval_escalations
  add constraint approval_escalations_from_approver_id_fkey
    foreign key (from_approver_id) references public.app_users(id) on delete set null,
  add constraint approval_escalations_to_approver_id_fkey
    foreign key (to_approver_id) references public.app_users(id) on delete set null;
