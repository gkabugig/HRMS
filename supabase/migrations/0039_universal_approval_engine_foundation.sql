-- Universal Approval Engine — Area 02 foundation.
--
-- The supplied spec assumes a fresh approval_definitions/approval_requests/
-- approval_steps/approval_actions schema (resource/resource_id/requester_id/
-- definition_id columns). The real schema already has a working, simpler
-- approval_requests/approval_steps/approval_actions set from Phase 2
-- (0023_phase2_foundation.sql: request_type/entity_type/entity_id/
-- requested_by/current_step, approver_user_id/approver_role, actor_user_id),
-- used today only by Employee Data Change (profile_change_requests). Leave
-- and Payroll deliberately keep their own bespoke, already-working decision
-- flows (see src/lib/approvals/create-approval-request.ts's own comment) —
-- this migration does not touch either.
--
-- Per the spec's own constraints ("do not rebuild existing modules", "do
-- not create a second approval system", "extend the current approval
-- foundation"), this migration is additive: new tables for what doesn't
-- exist yet (versioned definitions, escalations), and new nullable columns
-- on the three existing tables for what they're missing (definition
-- linkage, SLA timestamps, richer action metadata). Every existing row,
-- query, and RLS policy keeps working unchanged.
--
-- Also note: approval_delegations already exists (0023) with almost
-- exactly the shape spec §4 asks for — it was simply never wired into any
-- code path. This migration only adds the one column it was missing
-- (resource, for scoping a delegation to one module) rather than
-- recreating it.

-- ---------------------------------------------------------------------
-- 1. Versioned approval definitions (genuinely new — spec §4/§19.A/§19.B).
-- ---------------------------------------------------------------------

create table public.approval_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  resource text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  auto_start boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code, version)
);

create table public.approval_definition_steps (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.approval_definitions(id) on delete cascade,
  step_order integer not null,
  name text not null,
  approver_type text not null check (approver_type in (
    'REQUESTER_MANAGER', 'SECOND_LEVEL_MANAGER', 'DEPARTMENT_HEAD', 'BUSINESS_UNIT_HEAD',
    'HR_ROLE', 'SPECIFIC_ROLE', 'SPECIFIC_USER', 'POSITION_HOLDER', 'GROUP', 'COMMITTEE', 'AUTO'
  )),
  approver_value text,
  required boolean not null default true,
  allow_delegate boolean not null default true,
  allow_escalation boolean not null default true,
  sla_hours integer,
  condition_json jsonb not null default '{}'::jsonb,
  unique (definition_id, step_order)
);

create index idx_approval_definitions_org on public.approval_definitions(org_id, resource, is_active);
create index idx_approval_definition_steps_definition on public.approval_definition_steps(definition_id);

alter table public.approval_definitions enable row level security;
alter table public.approval_definition_steps enable row level security;

-- Same bootstrap reasoning as Area 01's rbac_roles: gated on the legacy
-- admin role, not on a permission the definitions themselves would grant.
create policy "approval_definitions_admin_manage" on public.approval_definitions
  as permissive for all to authenticated
  using (hrms_current_role() = 'admin' and org_id = current_org_id())
  with check (hrms_current_role() = 'admin' and org_id = current_org_id());

create policy "approval_definitions_org_read" on public.approval_definitions
  for select to authenticated
  using (org_id = current_org_id());

create policy "approval_definition_steps_admin_manage" on public.approval_definition_steps
  as permissive for all to authenticated
  using (
    hrms_current_role() = 'admin'
    and exists (select 1 from public.approval_definitions d where d.id = definition_id and d.org_id = current_org_id())
  )
  with check (
    exists (select 1 from public.approval_definitions d where d.id = definition_id and d.org_id = current_org_id())
  );

create policy "approval_definition_steps_org_read" on public.approval_definition_steps
  for select to authenticated
  using (exists (select 1 from public.approval_definitions d where d.id = definition_id and d.org_id = current_org_id()));

-- ---------------------------------------------------------------------
-- 2. Additive columns linking the existing tables to definitions, and
--    adding the SLA timestamps / richer action metadata the spec wants.
--    All nullable — every existing insert/update keeps working unchanged.
-- ---------------------------------------------------------------------

alter table public.approval_requests
  add column if not exists definition_id uuid references public.approval_definitions(id),
  add column if not exists definition_version integer,
  add column if not exists due_at timestamptz;

alter table public.approval_steps
  add column if not exists definition_step_id uuid references public.approval_definition_steps(id),
  add column if not exists due_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists delegated_from uuid references public.app_users(id),
  add column if not exists delegated_to uuid references public.app_users(id);

alter table public.approval_actions
  add column if not exists from_status text,
  add column if not exists to_status text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- approval_delegations already exists (0023) with delegator_user_id/
-- delegate_user_id/starts_at/ends_at/reason — just add resource scoping
-- (null = applies to every module, matching today's implicit behaviour
-- since nothing reads this table yet).
alter table public.approval_delegations
  add column if not exists resource text;

-- ---------------------------------------------------------------------
-- 3. SLA escalation foundation (genuinely new — spec §13/§19.G).
-- ---------------------------------------------------------------------

create table public.approval_escalations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  step_id uuid references public.approval_steps(id),
  from_approver_id uuid,
  to_approver_id uuid,
  reason text not null,
  created_at timestamptz not null default now()
);

create index idx_approval_escalations_request on public.approval_escalations(request_id, created_at);

alter table public.approval_escalations enable row level security;

create policy "approval_escalations_hr_read" on public.approval_escalations
  for select to authenticated
  using (
    hrms_current_role() in ('admin', 'hr')
    and exists (select 1 from public.approval_requests r where r.id = request_id and r.org_id = current_org_id())
  );

create policy "approval_escalations_participant_read" on public.approval_escalations
  for select to authenticated
  using (from_approver_id = auth.uid() or to_approver_id = auth.uid());

-- Escalations are written by the escalateStep() service using the normal
-- session (manual "Escalate" button) or the cron route's service-role
-- client — either way the insert is server-side, so a single org-scoped
-- insert policy covers both.
create policy "approval_escalations_org_insert" on public.approval_escalations
  for insert to authenticated
  with check (exists (select 1 from public.approval_requests r where r.id = request_id and r.org_id = current_org_id()));

-- ---------------------------------------------------------------------
-- 4. Idempotency: a step can only be decided once per action type (spec
--    §18 / §20 "Double approval creates one decision only"). Adapted to
--    the real column name (approval_request_id, not request_id).
-- ---------------------------------------------------------------------

create unique index uq_approval_actions_decision
  on public.approval_actions(approval_request_id, step_id, action)
  where action in ('approve', 'reject', 'return');

-- ---------------------------------------------------------------------
-- 5. Role-assigned steps are currently only decidable by admin/hr (the
--    approval_steps_hr_full policy) — a step assigned to approver_role =
--    'manager' (SPECIFIC_ROLE in the new resolver) had no RLS path for an
--    actual manager to decide it. This is a new PERMISSIVE policy (additive
--    — it can only broaden access alongside the existing ones, never
--    narrow), matching the already-existing approver_role column that
--    approval_steps_approver_decide's sibling never covered. Org-scoped via
--    the same join-back-to-approval_requests pattern 0025 already fixed
--    approval_steps_hr_full with — approval_steps has no org_id of its own.
-- ---------------------------------------------------------------------

create policy "approval_steps_role_decide" on public.approval_steps
  for update to authenticated
  using (
    approver_role is not null
    and hrms_current_role() = approver_role
    and exists (select 1 from public.approval_requests r where r.id = approval_request_id and r.org_id = current_org_id())
  )
  with check (
    approver_role is not null
    and hrms_current_role() = approver_role
    and exists (select 1 from public.approval_requests r where r.id = approval_request_id and r.org_id = current_org_id())
  );

-- ---------------------------------------------------------------------
-- 6. Widen the notifications category constraint for approval.* events,
--    same pattern 0026 used for self_service/service_request.
-- ---------------------------------------------------------------------

alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (category in
  ('leave','attendance','payroll','compliance','training','performance','recruitment','offboarding','documents','system','self_service','service_request','approval'));
