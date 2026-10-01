-- Universal RBAC & Data-Scope Security — Area 01 foundation.
--
-- Adapted from the supplied spec to the actual schema: the tenant table
-- here is `organizations` (not `organisations`), and an employee's login
-- identity is `app_users.employee_id` (employees has no `user_id` column).
-- current_org_id()/current_employee_id()/hrms_current_role()/is_manager_of()
-- already exist (0001-era foundation) and are reused rather than
-- reinvented, per the spec's own instruction in §20 to extend the existing
-- foundation instead of creating a parallel tenant/identity model.
--
-- This migration is additive only: it does not touch the legacy `role`
-- column on app_users, nor any existing RLS policy. A later migration
-- (0034) layers RESTRICTIVE policies on top of the existing permissive
-- ones for the three highest-risk resources (employees, employee
-- documents, payroll) — the existing policies keep working unchanged,
-- satisfying "do not remove existing RLS policies until the new policies
-- have been tested" by construction rather than by discipline.

create type public.rbac_action as enum (
  'view', 'create', 'edit', 'delete', 'approve', 'reject', 'export', 'manage'
);

create type public.rbac_scope as enum (
  'organisation', 'business_unit', 'department', 'team', 'direct_reports', 'self'
);

create type public.rbac_sensitivity as enum (
  'normal', 'confidential', 'highly_restricted'
);

create table if not exists public.rbac_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

-- Global catalogue — not org-scoped. What a "payroll.approve at
-- highly_restricted" permission even means is the same everywhere; which
-- role has it, and at what scope, is the org-specific part (role_permissions).
create table if not exists public.rbac_permissions (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action public.rbac_action not null,
  sensitivity public.rbac_sensitivity not null default 'normal',
  description text,
  unique (resource, action, sensitivity)
);

create table if not exists public.rbac_role_permissions (
  role_id uuid not null references public.rbac_roles(id) on delete cascade,
  permission_id uuid not null references public.rbac_permissions(id) on delete cascade,
  scope public.rbac_scope not null default 'organisation',
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id, scope)
);

create table if not exists public.rbac_user_roles (
  user_id uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.rbac_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id, role_id)
);

-- Temporary, reasoned exceptions (e.g. "give this HR admin direct_reports
-- access to Finance's payroll for the Nov audit, expires in 2 weeks").
-- The table exists from day one per the spec; the admin UI to manage it is
-- intentionally deferred to a later pass — see the PR/commit notes.
create table if not exists public.rbac_scope_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  resource text not null,
  action public.rbac_action not null,
  scope public.rbac_scope not null,
  scope_value uuid,
  expires_at timestamptz,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_rbac_user_roles_user on public.rbac_user_roles(user_id, org_id);
create index if not exists idx_rbac_user_roles_role on public.rbac_user_roles(role_id);
create index if not exists idx_rbac_role_permissions_role on public.rbac_role_permissions(role_id);
create index if not exists idx_rbac_role_permissions_permission on public.rbac_role_permissions(permission_id);
create index if not exists idx_rbac_scope_overrides_user on public.rbac_scope_overrides(user_id, org_id);
create index if not exists idx_rbac_scope_overrides_active on public.rbac_scope_overrides(user_id, resource, action, expires_at);

alter table public.rbac_roles enable row level security;
alter table public.rbac_permissions enable row level security;
alter table public.rbac_role_permissions enable row level security;
alter table public.rbac_user_roles enable row level security;
alter table public.rbac_scope_overrides enable row level security;

-- Bootstrap problem: until rbac_user_roles/rbac_role_permissions are
-- seeded, nobody holds the 'rbac.manage' permission the spec wants to
-- gate this with. Gate management of the RBAC system itself on the
-- legacy admin role (hrms_current_role()) rather than on the system it
-- configures — consistent with "do not remove the legacy role field
-- until all dependent code has been migrated" (spec §Constraints/6).
create policy "rbac_roles_admin_manage" on public.rbac_roles
  for all to authenticated
  using (hrms_current_role() = 'admin' and org_id = current_org_id())
  with check (hrms_current_role() = 'admin' and org_id = current_org_id());

create policy "rbac_roles_org_read" on public.rbac_roles
  for select to authenticated
  using (org_id = current_org_id());

-- Catalogue is global and not sensitive (it's just "what permissions
-- exist", not who has them) — readable by any authenticated user so the
-- Roles & Access screen and the effective-permission preview can render
-- resource/action labels without needing admin.
create policy "rbac_permissions_read" on public.rbac_permissions
  for select to authenticated using (true);

create policy "rbac_permissions_admin_manage" on public.rbac_permissions
  for all to authenticated
  using (hrms_current_role() = 'admin')
  with check (hrms_current_role() = 'admin');

create policy "rbac_role_permissions_admin_manage" on public.rbac_role_permissions
  for all to authenticated
  using (
    hrms_current_role() = 'admin'
    and exists (select 1 from public.rbac_roles r where r.id = role_id and r.org_id = current_org_id())
  )
  with check (
    exists (select 1 from public.rbac_roles r where r.id = role_id and r.org_id = current_org_id())
  );

create policy "rbac_role_permissions_org_read" on public.rbac_role_permissions
  for select to authenticated
  using (exists (select 1 from public.rbac_roles r where r.id = role_id and r.org_id = current_org_id()));

create policy "rbac_user_roles_admin_manage" on public.rbac_user_roles
  for all to authenticated
  using (hrms_current_role() = 'admin' and org_id = current_org_id())
  with check (hrms_current_role() = 'admin' and org_id = current_org_id());

-- Admin/HR can see the whole org's assignments (needed for the Roles &
-- Access screen); everyone can see their own (needed for the
-- effective-permission preview of "what can I do").
create policy "rbac_user_roles_org_read" on public.rbac_user_roles
  for select to authenticated
  using (
    org_id = current_org_id()
    and (hrms_current_role() = any (array['admin','hr']::user_role[]) or user_id = auth.uid())
  );

create policy "rbac_scope_overrides_admin_manage" on public.rbac_scope_overrides
  for all to authenticated
  using (hrms_current_role() = 'admin' and org_id = current_org_id())
  with check (hrms_current_role() = 'admin' and org_id = current_org_id());

create policy "rbac_scope_overrides_self_read" on public.rbac_scope_overrides
  for select to authenticated
  using (org_id = current_org_id() and (hrms_current_role() = any (array['admin','hr']::user_role[]) or user_id = auth.uid()));

-- Keeps rbac_user_roles in sync with app_users automatically, so the
-- existing Settings -> Manage Users screen (create login / change role /
-- remove access) needs no changes at all to populate the new system —
-- exactly the "compatibility bridge" the spec asks for in §6, done at the
-- data layer instead of by duplicating the sync logic into every caller.
create or replace function public.sync_rbac_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.rbac_user_roles where user_id = old.id and org_id = old.org_id;
    return old;
  end if;

  -- Ensure the four system roles exist for this org (first app_user in a
  -- new org can arrive before any seed migration has run for it).
  insert into public.rbac_roles (org_id, code, name, description, is_system)
  values
    (new.org_id, 'admin', 'Administrator', 'Full HRMS administration', true),
    (new.org_id, 'hr', 'HR', 'Human resources operations', true),
    (new.org_id, 'manager', 'Manager', 'People manager access', true),
    (new.org_id, 'employee', 'Employee', 'Self-service access', true)
  on conflict (org_id, code) do nothing;

  select id into v_role_id from public.rbac_roles where org_id = new.org_id and code = new.role::text;

  if tg_op = 'UPDATE' and old.org_id is distinct from new.org_id then
    delete from public.rbac_user_roles where user_id = old.id and org_id = old.org_id;
  end if;

  -- A user holds exactly one system role at a time in the legacy model;
  -- mirror that 1:1 rather than accumulating stale rows when role changes.
  delete from public.rbac_user_roles
  where user_id = new.id and org_id = new.org_id and role_id is distinct from v_role_id;

  if v_role_id is not null then
    insert into public.rbac_user_roles (user_id, org_id, role_id)
    values (new.id, new.org_id, v_role_id)
    on conflict (user_id, org_id, role_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_rbac_user_role on public.app_users;
create trigger trg_sync_rbac_user_role
  after insert or delete or update of role, org_id on public.app_users
  for each row execute function public.sync_rbac_user_role();
