-- Seeds and publishes version 1 of the "Employee Data Change" workflow
-- graph for every org that already has the (0024-seeded) workflow
-- definition row for it — the only workflow migrated onto the new engine
-- in this scope. Loops rather than hardcoding the one org that happens to
-- exist today, so a future org created the same way 0024 did gets this
-- graph automatically instead of silently having no workflow behind its
-- employee_data_change approval definition.
--
-- Graph (mirrors exactly what decideProfileChangeApproval used to do by
-- hand, now expressed as nodes/transitions instead of inline code):
--
--   start -> notify_manager -> approve --(approved)--> apply_change  --> notify_employee --(approved)--> end_approved
--                                       \-(rejected)-> reject_change /                   \-(rejected)-> end_rejected
--
-- Published immediately (not left in 'draft') — there's no editor UI in
-- this scope to publish it from later, and a workflow with no published
-- version simply never matches any event (startWorkflowFromEvent only
-- looks at current_version_id rows with status='published'), so leaving
-- it unpublished would make this whole migration a no-op.
do $$
declare
  def record;
  v_version_id uuid;
  v_start uuid;
  v_notify_manager uuid;
  v_approve uuid;
  v_apply uuid;
  v_reject uuid;
  v_notify_employee uuid;
  v_end_approved uuid;
  v_end_rejected uuid;
begin
  for def in select id, org_id from public.workflow_definitions where key = 'employee_data_change' loop

    insert into public.workflow_versions (org_id, workflow_id, version, status, published_at)
    values (def.org_id, def.id, 1, 'draft', null)
    returning id into v_version_id;

    insert into public.workflow_nodes (org_id, workflow_version_id, node_key, node_type, name, config_json)
    values (def.org_id, v_version_id, 'start', 'start', 'Start', '{}'::jsonb)
    returning id into v_start;

    insert into public.workflow_nodes (org_id, workflow_version_id, node_key, node_type, name, config_json)
    values (
      def.org_id, v_version_id, 'notify_manager', 'notification', 'Notify manager',
      jsonb_build_object(
        'audience', 'manager',
        'type', 'PROFILE_CHANGE_REQUESTED',
        'category', 'self_service',
        'priority', 'information',
        'title', 'Profile change request submitted',
        'message_template', '{employeeName} requested to change {fieldLabel}.',
        'action_url', '/dashboard/approvals'
      )
    )
    returning id into v_notify_manager;

    insert into public.workflow_nodes (org_id, workflow_version_id, node_key, node_type, name, config_json)
    values (
      def.org_id, v_version_id, 'approve', 'approval', 'HR approval',
      jsonb_build_object(
        'resource', 'employee_data_change',
        'summary_template', 'Change {fieldLabel} from "{oldValueDisplay}" to "{newValue}"'
      )
    )
    returning id into v_approve;

    insert into public.workflow_nodes (org_id, workflow_version_id, node_key, node_type, name, config_json)
    values (def.org_id, v_version_id, 'apply_change', 'action', 'Apply change', jsonb_build_object('action_key', 'apply_profile_change'))
    returning id into v_apply;

    insert into public.workflow_nodes (org_id, workflow_version_id, node_key, node_type, name, config_json)
    values (def.org_id, v_version_id, 'reject_change', 'action', 'Reject change', jsonb_build_object('action_key', 'reject_profile_change'))
    returning id into v_reject;

    insert into public.workflow_nodes (org_id, workflow_version_id, node_key, node_type, name, config_json)
    values (
      def.org_id, v_version_id, 'notify_employee', 'notification', 'Notify employee',
      jsonb_build_object(
        'audience', 'employee',
        'type', 'PROFILE_CHANGE_DECIDED',
        'category', 'self_service',
        'priority', 'information',
        'title', 'Profile change {decisionLabel}',
        'message_template', 'Your request to change {fieldLabel} was {decision}.',
        'action_url', '/dashboard/employees/me'
      )
    )
    returning id into v_notify_employee;

    insert into public.workflow_nodes (org_id, workflow_version_id, node_key, node_type, name, config_json)
    values (def.org_id, v_version_id, 'end_approved', 'end', 'Approved', jsonb_build_object('outcome', 'completed'))
    returning id into v_end_approved;

    insert into public.workflow_nodes (org_id, workflow_version_id, node_key, node_type, name, config_json)
    values (def.org_id, v_version_id, 'end_rejected', 'end', 'Rejected', jsonb_build_object('outcome', 'failed'))
    returning id into v_end_rejected;

    insert into public.workflow_transitions (org_id, workflow_version_id, from_node_id, to_node_id, branch, order_index) values
      (def.org_id, v_version_id, v_start, v_notify_manager, null, 0),
      (def.org_id, v_version_id, v_notify_manager, v_approve, null, 0),
      (def.org_id, v_version_id, v_approve, v_apply, 'approved', 0),
      (def.org_id, v_version_id, v_approve, v_reject, 'rejected', 1),
      (def.org_id, v_version_id, v_apply, v_notify_employee, null, 0),
      (def.org_id, v_version_id, v_reject, v_notify_employee, null, 0),
      (def.org_id, v_version_id, v_notify_employee, v_end_approved, 'approved', 0),
      (def.org_id, v_version_id, v_notify_employee, v_end_rejected, 'rejected', 1);

    insert into public.workflow_triggers (org_id, workflow_version_id, event_name, condition_json)
    values (def.org_id, v_version_id, 'employee_data_change.requested', '{}'::jsonb);

    update public.workflow_versions set status = 'published', published_at = now() where id = v_version_id;
    update public.workflow_definitions set current_version_id = v_version_id where id = def.id;

  end loop;
end $$;
