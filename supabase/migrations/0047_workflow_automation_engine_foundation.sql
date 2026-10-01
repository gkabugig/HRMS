-- Workflow Automation Engine (Area 03) — foundation + Employee Data Change
-- scope (per the user's explicit AskUserQuestion selection: versioned
-- definitions/triggers/nodes, a durable event/outbox table, a sequential
-- runtime covering start/task/approval/action/condition/notification/end
-- node types, SLA/idempotency/execution logs, and migrating Employee Data
-- Change onto it end-to-end — no parallel/join, no general wait/resume
-- beyond the approval-node case, no admin editor UI, just a read-only
-- catalogue + run-detail view).
--
-- "Extend existing foundation, do not create a parallel workflow system"
-- (spec constraint): workflow_definitions/workflow_runs/workflow_logs are
-- extended additively; the 5 hard-coded priority workflows (onboarding,
-- leave, contract renewal, offboarding) keep using start-workflow-run.ts
-- completely unchanged and keep working against these same tables.
--
-- RLS design note (direct lesson from Area 02's 0045/0046): rather than
-- fix a cross-table policy cycle after the fact, every new table here
-- carries its own org_id column so no policy ever has to subquery another
-- RLS-protected table to find out which org a row belongs to. That
-- structurally rules out the two-table-cycle recursion class (42P17) and
-- the UPDATE-without-matching-SELECT gap found in Area 02 — there's simply
-- no cross-table reference for either bug to live in.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type workflow_version_status as enum ('draft', 'published', 'archived');

-- All 9 node types from the spec are named here for forward-compatibility,
-- but only start/task/approval/action/condition/notification/end are
-- actually implemented by executeNode() in this pass — see
-- src/lib/workflows/runtime/execute-node.ts. parallel and wait are not
-- used by any seeded workflow and executeNode() throws a clear
-- "not implemented in this scope" error if one is ever encountered, rather
-- than silently misbehaving.
create type workflow_node_type as enum ('start', 'task', 'approval', 'action', 'condition', 'parallel', 'wait', 'notification', 'end');

create type workflow_run_node_status as enum ('pending', 'active', 'waiting', 'completed', 'failed', 'skipped');

create type workflow_event_status as enum ('pending', 'processed', 'failed', 'skipped');

-- ---------------------------------------------------------------------
-- Extend existing tables (additive only)
-- ---------------------------------------------------------------------
alter table public.workflow_definitions add column if not exists description text;
-- Back-filled once workflow_versions exists (see below) — the version a
-- matching trigger is actually resolved against. Null for the 5 hard-coded
-- priority workflows, which never gain a version row and keep running
-- exactly as start-workflow-run.ts always has.
-- (current_version_id column added after workflow_versions is created.)

alter table public.workflow_runs add column if not exists workflow_version_id uuid;
alter table public.workflow_runs add column if not exists current_node_id uuid;
alter table public.workflow_runs add column if not exists triggering_event_id uuid;
-- Merged event payload + running decisions (e.g. {"decision":"approved"}
-- stamped on after the approval node resolves) — what executeNode() reads
-- to template summaries/messages and to pick a branch when a node's own
-- output doesn't set one explicitly (see execute-node.ts).
alter table public.workflow_runs add column if not exists context_json jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- workflow_versions
-- ---------------------------------------------------------------------
create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  workflow_id uuid not null references public.workflow_definitions(id) on delete cascade,
  version int not null,
  status workflow_version_status not null default 'draft',
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (workflow_id, version)
);

alter table public.workflow_definitions
  add column if not exists current_version_id uuid references public.workflow_versions(id);

-- ---------------------------------------------------------------------
-- workflow_triggers — event_name + condition, evaluated against the
-- publishing event's payload with the same ConditionRule shape Area 02's
-- evaluate-condition.ts already uses ({} always matches).
-- ---------------------------------------------------------------------
create table public.workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  workflow_version_id uuid not null references public.workflow_versions(id) on delete cascade,
  event_name text not null,
  condition_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- workflow_nodes — the graph. node_key is stable within a version so
-- transitions and seed scripts can refer to nodes by name instead of a
-- generated uuid.
-- ---------------------------------------------------------------------
create table public.workflow_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  workflow_version_id uuid not null references public.workflow_versions(id) on delete cascade,
  node_key text not null,
  node_type workflow_node_type not null,
  name text not null,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_version_id, node_key)
);

-- ---------------------------------------------------------------------
-- workflow_transitions — directed edges. branch is matched against the
-- executing node's output (or, failing that, run.context_json.decision)
-- to pick the next node; null branch means "the default/only edge".
-- ---------------------------------------------------------------------
create table public.workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  workflow_version_id uuid not null references public.workflow_versions(id) on delete cascade,
  from_node_id uuid not null references public.workflow_nodes(id) on delete cascade,
  to_node_id uuid not null references public.workflow_nodes(id) on delete cascade,
  branch text,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_workflow_transitions_from on public.workflow_transitions(from_node_id);

-- ---------------------------------------------------------------------
-- workflow_run_nodes — per-run execution state. (workflow_run_id, node_id,
-- attempt) is the idempotency key the spec calls for: executeNode() checks
-- for an existing completed row before doing any side-effecting work, so a
-- retry (cron sweep, a resumed process) can never re-run an action twice.
-- approval_request_id is the generic resume hook: decideApprovalStep()
-- itself stays completely unaware of workflows (Area 02 constraint); the
-- caller (decideProfileChangeApproval) looks up the waiting run_node by
-- this column after deciding the step.
-- ---------------------------------------------------------------------
create table public.workflow_run_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  node_id uuid not null references public.workflow_nodes(id),
  status workflow_run_node_status not null default 'pending',
  attempt int not null default 1,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb,
  error text,
  approval_request_id uuid references public.approval_requests(id),
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_run_id, node_id, attempt)
);

create index idx_workflow_run_nodes_run on public.workflow_run_nodes(workflow_run_id);
-- Partial + unique: at most one *active* waiting run_node per approval
-- request, which is exactly what makes the resume lookup safe to assume
-- "at most one match" without an explicit ORDER BY/LIMIT race.
create unique index idx_workflow_run_nodes_waiting_approval
  on public.workflow_run_nodes(approval_request_id)
  where status = 'waiting' and approval_request_id is not null;
-- SLA sweep (mirrors Area 02's idx_approval_steps_pending_due).
create index idx_workflow_run_nodes_waiting_due
  on public.workflow_run_nodes(due_at)
  where status = 'waiting';

-- ---------------------------------------------------------------------
-- workflow_events — durable outbox. The happy path processes a row
-- synchronously in the same request that inserts it; /api/cron/
-- workflow-events is only the safety net for anything left 'pending'
-- because the process crashed or threw between insert and processing.
-- ---------------------------------------------------------------------
create table public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  event_name text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload_json jsonb not null default '{}'::jsonb,
  status workflow_event_status not null default 'pending',
  error text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_workflow_events_pending on public.workflow_events(created_at) where status = 'pending';

alter table public.workflow_runs
  add constraint workflow_runs_workflow_version_id_fkey foreign key (workflow_version_id) references public.workflow_versions(id),
  add constraint workflow_runs_current_node_id_fkey foreign key (current_node_id) references public.workflow_nodes(id),
  add constraint workflow_runs_triggering_event_id_fkey foreign key (triggering_event_id) references public.workflow_events(id);

-- ---------------------------------------------------------------------
-- Published-version immutability: once a version is 'published', its
-- graph is fixed — to change behaviour you create a new version, not edit
-- one a live run may already be mid-way through. Enforced structurally,
-- not just by convention, since "published-immutability denial" is one of
-- the explicit acceptance checks for this area.
-- ---------------------------------------------------------------------
create or replace function public.workflow_version_immutability_guard()
returns trigger
language plpgsql
as $$
declare
  v_version_id uuid;
  v_status workflow_version_status;
begin
  v_version_id := coalesce(new.workflow_version_id, old.workflow_version_id);
  select status into v_status from public.workflow_versions where id = v_version_id;
  if v_status = 'published' then
    raise exception 'Cannot modify the graph of a published workflow version (%). Create a new version instead.', v_version_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_workflow_nodes_immutability
  before insert or update or delete on public.workflow_nodes
  for each row execute function public.workflow_version_immutability_guard();

create trigger trg_workflow_transitions_immutability
  before insert or update or delete on public.workflow_transitions
  for each row execute function public.workflow_version_immutability_guard();

create trigger trg_workflow_triggers_immutability
  before insert or update or delete on public.workflow_triggers
  for each row execute function public.workflow_version_immutability_guard();

-- A published version also can't be un-published or have its version
-- number changed in place.
create or replace function public.workflow_version_self_immutability_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' and (new.status is distinct from old.status and new.status = 'draft') then
    raise exception 'Cannot revert a published workflow version (%) back to draft.', old.id;
  end if;
  if old.status = 'published' and new.version is distinct from old.version then
    raise exception 'Cannot change the version number of a published workflow version (%).', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_workflow_versions_immutability
  before update on public.workflow_versions
  for each row execute function public.workflow_version_self_immutability_guard();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.workflow_versions enable row level security;
alter table public.workflow_triggers enable row level security;
alter table public.workflow_nodes enable row level security;
alter table public.workflow_transitions enable row level security;
alter table public.workflow_run_nodes enable row level security;
alter table public.workflow_events enable row level security;

-- Catalogue tables: same split as the pre-existing workflow_definitions
-- policies (0024) — org members can read (the read-only catalogue/
-- run-detail UI this scope calls for), only admin/hr can write (and, for
-- the three graph tables, "write" to a published version is blocked
-- outright by the trigger above regardless of role).
create policy "workflow_versions_read_all" on public.workflow_versions for select using (org_id = current_org_id());
create policy "workflow_versions_hr_write" on public.workflow_versions for all using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

create policy "workflow_triggers_read_all" on public.workflow_triggers for select using (org_id = current_org_id());
create policy "workflow_triggers_hr_write" on public.workflow_triggers for all using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

create policy "workflow_nodes_read_all" on public.workflow_nodes for select using (org_id = current_org_id());
create policy "workflow_nodes_hr_write" on public.workflow_nodes for all using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

create policy "workflow_transitions_read_all" on public.workflow_transitions for select using (org_id = current_org_id());
create policy "workflow_transitions_hr_write" on public.workflow_transitions for all using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

-- Run state: admin/hr get the full run-detail view; the employee whose own
-- request this run is processing can at least see it progress (matches
-- the self-service spirit of profile-change-requests — they can already
-- see their own approval_requests via approval_requests_requester_read,
-- so seeing the workflow run over the same request is no wider a
-- disclosure). "Own" is decided off workflow_runs.entity_id, which for
-- Employee Data Change is the profile_change_requests row they created.
create policy "workflow_run_nodes_hr_full" on public.workflow_run_nodes for all using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());
create policy "workflow_run_nodes_requester_read" on public.workflow_run_nodes for select using (
  org_id = current_org_id()
  and exists (
    select 1 from public.workflow_runs wr
    join public.profile_change_requests pcr on pcr.id = wr.entity_id and wr.entity_type = 'profile_change_request'
    join public.employees e on e.id = pcr.employee_id
    join public.app_users au on au.employee_id = e.id
    where wr.id = workflow_run_nodes.workflow_run_id and au.id = auth.uid()
  )
);

-- Events: inserted by the submitting user's own RLS-scoped session (so
-- "write" needs a plain authenticated-org policy, not just hr), processed
-- synchronously by that same session or later by the cron worker's
-- service-role client (which bypasses RLS entirely, same as the existing
-- approval-escalations cron).
create policy "workflow_events_org_insert" on public.workflow_events for insert with check (org_id = current_org_id());
create policy "workflow_events_org_read" on public.workflow_events for select using (org_id = current_org_id());
create policy "workflow_events_hr_update" on public.workflow_events for update using (hrms_current_role() in ('admin', 'hr') and org_id = current_org_id());

-- ---------------------------------------------------------------------
-- Indexes for the new foreign keys (performance advisor housekeeping,
-- same as 0044 did for Area 02).
-- ---------------------------------------------------------------------
create index idx_workflow_versions_workflow on public.workflow_versions(workflow_id);
create index idx_workflow_versions_created_by on public.workflow_versions(created_by);
create index idx_workflow_triggers_version on public.workflow_triggers(workflow_version_id);
create index idx_workflow_nodes_version on public.workflow_nodes(workflow_version_id);
create index idx_workflow_transitions_to on public.workflow_transitions(to_node_id);
create index idx_workflow_run_nodes_node on public.workflow_run_nodes(node_id);
create index idx_workflow_run_nodes_approval_request on public.workflow_run_nodes(approval_request_id);
create index idx_workflow_runs_version on public.workflow_runs(workflow_version_id);
create index idx_workflow_runs_current_node on public.workflow_runs(current_node_id);
create index idx_workflow_runs_triggering_event on public.workflow_runs(triggering_event_id);
create index idx_workflow_events_created_by on public.workflow_events(created_by);
create index idx_workflow_definitions_current_version on public.workflow_definitions(current_version_id);
