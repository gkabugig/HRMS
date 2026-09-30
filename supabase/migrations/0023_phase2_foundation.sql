-- Phase 2 Enterprise Functionality foundation (see
-- HRMS_Phase_2_Enterprise_Functionality_Build_Specification.docx). Per the
-- spec's own non-negotiables ("do not rebuild existing HRMS modules
-- unnecessarily", "reuse existing schema where it already solves the
-- requirement", "never use DEFAULT_ORG_ID as a security boundary — derive
-- organisation context from the authenticated session"):
--
-- - The existing 4-role (admin/hr/manager/employee) model and every
--   existing RLS policy stay exactly as they are; this migration is
--   additive only. A from-scratch custom-role/scope RBAC editor and a
--   drag-and-drop Workflow Builder UI are explicitly out of scope for this
--   pass (see the session's build notes) — workflow_definitions/runs below
--   exist so the priority workflows are inspectable, not configurable.
-- - Policy documents/acknowledgements already exist (policies,
--   policy_acknowledgments from 0001/0002) — reused as-is, not duplicated.
-- - employee_documents (0012/0016) already is a private-bucket, signed-URL,
--   visibility-scoped document table — extended below with sensitivity/
--   status rather than replaced by a parallel `documents` table.
-- - Every table below still derives its tenant boundary from
--   current_org_id() (SECURITY DEFINER, reads the authenticated user's own
--   app_users row) exactly like every existing table — never from a
--   client-supplied or hard-coded org id.

-- ============ AUDIT CENTRE ============

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  actor_user_id uuid references app_users(id),
  actor_role user_role,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  event_category text not null check (event_category in
    ('authentication','access','data','workflow','approval','security','export','configuration')),
  risk_level text not null default 'normal' check (risk_level in ('normal','elevated','high')),
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_events_org on audit_events(org_id, created_at desc);
create index idx_audit_events_resource on audit_events(resource_type, resource_id);
create index idx_audit_events_actor on audit_events(actor_user_id);
alter table audit_events enable row level security;

-- Append-only by construction: no update/delete policy exists for any
-- role, admin included, so there is no way to alter or remove an audit
-- event through the API short of a direct database migration.
create policy "audit_events_hr_read" on audit_events
  for select using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "audit_events_org_insert" on audit_events
  for insert with check (org_id = current_org_id());

-- ============ ORGANISATION HIERARCHY ============
-- Additive alongside employees.department (text) and
-- employees.reporting_manager_id, which stay the live values every
-- existing query already reads — rewriting those across ~20 migrations'
-- worth of RLS/queries is exactly the "rebuild existing modules"
-- the spec says not to do. This is a real hierarchy layer going forward:
-- new departments/teams/positions are modelled here, and employees can be
-- linked to a position without changing how the rest of the app reads
-- their department/title.

create type org_unit_type as enum ('business_unit', 'department', 'team');

create table organisation_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  parent_id uuid references organisation_units(id),
  name text not null,
  unit_type org_unit_type not null,
  head_employee_id uuid references employees(id),
  created_at timestamptz not null default now()
);

create index idx_org_units_org on organisation_units(org_id);
create index idx_org_units_parent on organisation_units(parent_id);
alter table organisation_units enable row level security;

create policy "org_units_read_all" on organisation_units
  for select using (org_id = current_org_id());

create policy "org_units_hr_write" on organisation_units
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  address text,
  is_remote boolean not null default false,
  created_at timestamptz not null default now()
);

alter table locations enable row level security;

create policy "locations_read_all" on locations
  for select using (org_id = current_org_id());

create policy "locations_hr_write" on locations
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create table cost_centres (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  unique (org_id, code)
);

alter table cost_centres enable row level security;

create policy "cost_centres_read_all" on cost_centres
  for select using (org_id = current_org_id());

create policy "cost_centres_hr_write" on cost_centres
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create table positions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  title text not null,
  organisation_unit_id uuid references organisation_units(id),
  location_id uuid references locations(id),
  cost_centre_id uuid references cost_centres(id),
  reports_to_position_id uuid references positions(id),
  headcount_approved int not null default 1,
  status text not null default 'vacant' check (status in ('vacant', 'occupied')),
  created_at timestamptz not null default now()
);

create index idx_positions_org on positions(org_id);
create index idx_positions_unit on positions(organisation_unit_id);
alter table positions enable row level security;

create policy "positions_read_all" on positions
  for select using (org_id = current_org_id());

create policy "positions_hr_write" on positions
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- Effective-dated employee-to-position history (spec §5.3: "changes must
-- not rewrite historical records"). A null effective_to means current.
create table employee_positions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  position_id uuid not null references positions(id),
  effective_from date not null default current_date,
  effective_to date,
  is_primary boolean not null default true,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_employee_positions_employee on employee_positions(employee_id);
create index idx_employee_positions_position on employee_positions(position_id);
alter table employee_positions enable row level security;

create policy "employee_positions_hr_full" on employee_positions
  for all using (hrms_current_role() in ('admin','hr'));

create policy "employee_positions_manager_team_read" on employee_positions
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "employee_positions_self_read" on employee_positions
  for select using (employee_id = current_employee_id());

-- Historical reporting-line trail (spec §5.2/§5.3), written alongside
-- employees.reporting_manager_id changes rather than replacing that live
-- pointer. is_primary distinguishes the one manager every existing feature
-- (approvals, team scoping) already keys off from any secondary/dotted-line
-- relationship recorded here for reference only.
create table reporting_relationships (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  manager_id uuid not null references employees(id),
  is_primary boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now()
);

create index idx_reporting_rel_employee on reporting_relationships(employee_id);
alter table reporting_relationships enable row level security;

create policy "reporting_rel_hr_full" on reporting_relationships
  for all using (hrms_current_role() in ('admin','hr'));

create policy "reporting_rel_manager_team_read" on reporting_relationships
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "reporting_rel_self_read" on reporting_relationships
  for select using (employee_id = current_employee_id());

-- ============ APPROVAL ENGINE ============

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  request_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  requested_by uuid not null references app_users(id),
  subject_employee_id uuid references employees(id),
  status text not null default 'pending_approval' check (status in
    ('draft','submitted','pending_approval','approved','rejected','returned','completed','cancelled')),
  summary text not null,
  impact_json jsonb,
  current_step int not null default 1,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index idx_approval_requests_org on approval_requests(org_id, status);
create index idx_approval_requests_entity on approval_requests(entity_type, entity_id);
alter table approval_requests enable row level security;

create policy "approval_requests_hr_full" on approval_requests
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "approval_requests_requester_read" on approval_requests
  for select using (requested_by = auth.uid());

create table approval_steps (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references approval_requests(id) on delete cascade,
  step_order int not null,
  approver_user_id uuid references app_users(id),
  approver_role user_role,
  status text not null default 'pending' check (status in ('pending','approved','rejected','returned','skipped','delegated')),
  decided_at timestamptz,
  comment text
);

create index idx_approval_steps_request on approval_steps(approval_request_id);
create index idx_approval_steps_approver on approval_steps(approver_user_id);
alter table approval_steps enable row level security;

create policy "approval_steps_hr_full" on approval_steps
  for all using (hrms_current_role() in ('admin','hr'));

create policy "approval_steps_approver_read" on approval_steps
  for select using (approver_user_id = auth.uid());

create policy "approval_steps_approver_decide" on approval_steps
  for update using (approver_user_id = auth.uid())
  with check (approver_user_id = auth.uid());

create policy "approval_steps_requester_read" on approval_steps
  for select using (
    exists (select 1 from approval_requests r where r.id = approval_request_id and r.requested_by = auth.uid())
  );

-- An approval request is visible to whoever is (or was) an approver on one
-- of its steps — resolved through approval_steps, not a role check, since
-- the approver can be a named user, not just "manager". Declared here,
-- after approval_steps exists, since the policy's subquery references it.
create policy "approval_requests_approver_read" on approval_requests
  for select using (
    exists (select 1 from approval_steps s where s.approval_request_id = id and s.approver_user_id = auth.uid())
  );

-- Immutable decision trail (spec §10.1 approval_actions / approval_history
-- combined — one append-only log of every action taken on a request).
create table approval_actions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references approval_requests(id) on delete cascade,
  step_id uuid references approval_steps(id),
  actor_user_id uuid not null references app_users(id),
  action text not null check (action in ('approve','reject','return','delegate','skip','submit','cancel')),
  reason text,
  created_at timestamptz not null default now()
);

create index idx_approval_actions_request on approval_actions(approval_request_id);
alter table approval_actions enable row level security;

create policy "approval_actions_hr_read" on approval_actions
  for select using (hrms_current_role() in ('admin','hr'));

create policy "approval_actions_participant_read" on approval_actions
  for select using (
    actor_user_id = auth.uid()
    or exists (select 1 from approval_requests r where r.id = approval_request_id and r.requested_by = auth.uid())
  );

create policy "approval_actions_actor_insert" on approval_actions
  for insert with check (actor_user_id = auth.uid());

-- Time-bound approval delegation (spec §10.3 "Delegation must be
-- time-bound and visible"), separate from permanent RBAC.
create table approval_delegations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  delegator_user_id uuid not null references app_users(id),
  delegate_user_id uuid not null references app_users(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_approval_delegations_delegator on approval_delegations(delegator_user_id, ends_at);
alter table approval_delegations enable row level security;

create policy "approval_delegations_self_manage" on approval_delegations
  for all using (delegator_user_id = auth.uid()) with check (delegator_user_id = auth.uid());

create policy "approval_delegations_delegate_read" on approval_delegations
  for select using (delegate_user_id = auth.uid());

create policy "approval_delegations_hr_read" on approval_delegations
  for select using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- ============ DOCUMENT MANAGEMENT (extends employee_documents, 0012/0016) ============

alter table employee_documents add column sensitivity text not null default 'Confidential'
  check (sensitivity in ('Public','Internal','Confidential','Highly Restricted'));
alter table employee_documents add column status text not null default 'Active'
  check (status in ('Active','Superseded'));
alter table employee_documents add column superseded_by uuid references employee_documents(id);

-- Every view/download of a document is logged here — this is what makes
-- "access to confidential documents should itself be auditable" (spec §6.3)
-- true rather than aspirational; the signed-URL action writes one row per
-- link it issues.
create table document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references employee_documents(id) on delete cascade,
  accessed_by uuid not null references app_users(id),
  action text not null check (action in ('view','download')),
  accessed_at timestamptz not null default now()
);

create index idx_document_access_logs_document on document_access_logs(document_id);
alter table document_access_logs enable row level security;

create policy "document_access_logs_hr_read" on document_access_logs
  for select using (hrms_current_role() in ('admin','hr'));

create policy "document_access_logs_insert" on document_access_logs
  for insert with check (accessed_by = auth.uid());

-- HR/a manager asks an employee to upload a specific document (spec §7.4
-- "Document request flow should show exactly what is needed and why").
create table document_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  doc_type text not null,
  reason text not null,
  due_date date,
  status text not null default 'Requested' check (status in ('Requested','Fulfilled','Cancelled')),
  requested_by uuid references app_users(id),
  fulfilled_document_id uuid references employee_documents(id),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index idx_document_requests_employee on document_requests(employee_id, status);
alter table document_requests enable row level security;

create policy "document_requests_hr_full" on document_requests
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "document_requests_self_read" on document_requests
  for select using (employee_id = current_employee_id());

create policy "document_requests_self_fulfil" on document_requests
  for update using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id());

-- ============ SELF-SERVICE: PROFILE CHANGE REQUESTS ============
-- "Submit correction ... creates a controlled request, not a silent data
-- edit" (spec §8.2). Routed through the approval engine above.

create table profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  field text not null,
  old_value text,
  new_value text not null,
  reason text,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  approval_request_id uuid references approval_requests(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index idx_profile_change_requests_employee on profile_change_requests(employee_id);
alter table profile_change_requests enable row level security;

create policy "profile_change_requests_hr_full" on profile_change_requests
  for all using (hrms_current_role() in ('admin','hr'));

create policy "profile_change_requests_self_read" on profile_change_requests
  for select using (employee_id = current_employee_id());

create policy "profile_change_requests_self_insert" on profile_change_requests
  for insert with check (employee_id = current_employee_id());

-- ============ HR SERVICE REQUESTS ============

create table service_catalogue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  category text not null,
  label text not null,
  description text,
  default_sla_hours int not null default 72,
  active boolean not null default true
);

alter table service_catalogue enable row level security;

create policy "service_catalogue_read_all" on service_catalogue
  for select using (org_id = current_org_id());

create policy "service_catalogue_hr_write" on service_catalogue
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  catalogue_id uuid references service_catalogue(id),
  employee_id uuid not null references employees(id),
  subject text not null,
  description text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'Submitted' check (status in
    ('Submitted','Triaged','Assigned','In Progress','Waiting for Employee','Resolved','Closed')),
  assigned_to uuid references app_users(id),
  sla_due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_service_requests_org on service_requests(org_id, status);
create index idx_service_requests_employee on service_requests(employee_id);
alter table service_requests enable row level security;

create policy "service_requests_hr_full" on service_requests
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy "service_requests_self_read" on service_requests
  for select using (employee_id = current_employee_id());

create policy "service_requests_self_insert" on service_requests
  for insert with check (employee_id = current_employee_id() and org_id = current_org_id());

create table service_request_messages (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  author_user_id uuid not null references app_users(id),
  message text not null,
  internal_only boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_service_request_messages_request on service_request_messages(service_request_id);
alter table service_request_messages enable row level security;

create policy "service_request_messages_hr_full" on service_request_messages
  for all using (hrms_current_role() in ('admin','hr'));

-- The requester sees the conversation but never an internal-only note —
-- exactly the spec's "internal notes remain private" requirement.
create policy "service_request_messages_self_read" on service_request_messages
  for select using (
    not internal_only
    and exists (select 1 from service_requests sr where sr.id = service_request_id and sr.employee_id = current_employee_id())
  );

create policy "service_request_messages_self_insert" on service_request_messages
  for insert with check (
    not internal_only
    and author_user_id = auth.uid()
    and exists (select 1 from service_requests sr where sr.id = service_request_id and sr.employee_id = current_employee_id())
  );

create table service_request_tasks (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  task text not null,
  done boolean not null default false,
  assigned_to uuid references app_users(id),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create index idx_service_request_tasks_request on service_request_tasks(service_request_id);
alter table service_request_tasks enable row level security;

create policy "service_request_tasks_hr_full" on service_request_tasks
  for all using (hrms_current_role() in ('admin','hr'));

-- Immutable status trail (spec §9.2 service_request_status_history).
create table service_request_status_history (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index idx_service_request_status_history_request on service_request_status_history(service_request_id);
alter table service_request_status_history enable row level security;

create policy "service_request_status_history_hr_read" on service_request_status_history
  for select using (hrms_current_role() in ('admin','hr'));

create policy "service_request_status_history_self_read" on service_request_status_history
  for select using (
    exists (select 1 from service_requests sr where sr.id = service_request_id and sr.employee_id = current_employee_id())
  );

create policy "service_request_status_history_insert" on service_request_status_history
  for insert with check (
    hrms_current_role() in ('admin','hr')
    or exists (select 1 from service_requests sr where sr.id = service_request_id and sr.employee_id = current_employee_id())
  );

-- ============ WORKFLOW AUTOMATION (run history for code-defined priority workflows) ============
-- No admin-configurable rules/steps tables — this pass hard-wires the five
-- priority workflows (spec §20) directly into the server actions that
-- already own each event, and records what ran here so it's inspectable.
-- A visual Automation Builder is deliberately out of scope (see the
-- migration header note).

create table workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  key text not null,
  name text not null,
  trigger_event text not null,
  active boolean not null default true,
  unique (org_id, key)
);

alter table workflow_definitions enable row level security;

create policy "workflow_definitions_read_all" on workflow_definitions
  for select using (org_id = current_org_id());

create policy "workflow_definitions_hr_write" on workflow_definitions
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflow_definitions(id),
  org_id uuid not null references organizations(id),
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_workflow_runs_workflow on workflow_runs(workflow_id, started_at desc);
create index idx_workflow_runs_entity on workflow_runs(entity_type, entity_id);
alter table workflow_runs enable row level security;

create policy "workflow_runs_hr_full" on workflow_runs
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create table workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  task text not null,
  assignee_user_id uuid references app_users(id),
  assignee_role user_role,
  status text not null default 'pending' check (status in ('pending','done','skipped')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_workflow_tasks_run on workflow_tasks(workflow_run_id);
alter table workflow_tasks enable row level security;

create policy "workflow_tasks_hr_full" on workflow_tasks
  for all using (hrms_current_role() in ('admin','hr'));

create policy "workflow_tasks_assignee_read" on workflow_tasks
  for select using (assignee_user_id = auth.uid());

create policy "workflow_tasks_assignee_complete" on workflow_tasks
  for update using (assignee_user_id = auth.uid())
  with check (assignee_user_id = auth.uid());

create table workflow_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  step text not null,
  event text not null,
  result text,
  created_at timestamptz not null default now()
);

create index idx_workflow_logs_run on workflow_logs(workflow_run_id);
alter table workflow_logs enable row level security;

create policy "workflow_logs_hr_read" on workflow_logs
  for select using (hrms_current_role() in ('admin','hr'));

create policy "workflow_logs_insert" on workflow_logs
  for insert with check (
    exists (
      select 1 from workflow_runs wr where wr.id = workflow_run_id and wr.org_id = current_org_id()
    )
  );
