-- Custom roles + per-module permissions.
--
-- Design: the four built-in roles (admin/hr/manager/employee) stay as the
-- security BASELINE - every existing RLS policy keys off app_users.role and
-- is untouched. A custom role (e.g. "Payroll Officer") is built on one of
-- those baselines and can only be NARROWER than it:
--   * base_role           : which built-in role it is built on (hr/manager/employee;
--                           never admin, so a custom role can't be a partial back-door admin)
--   * rbac_role_permissions: its fine-grained grants - a trigger below rejects any
--                           grant that exceeds what the base role itself holds
--   * rbac_role_modules   : which menu modules it can open (also enforced on the
--                           server for every page request, not just hidden in the menu)
-- Assigning a custom role to a user sets app_users.custom_role_id; a trigger
-- keeps app_users.role equal to the base role so legacy RLS stays coherent.

alter table public.rbac_roles
  add column if not exists base_role user_role;

alter table public.rbac_roles drop constraint if exists rbac_roles_custom_needs_base;
alter table public.rbac_roles add constraint rbac_roles_custom_needs_base
  check (is_system or base_role in ('hr', 'manager', 'employee'));

alter table public.app_users
  add column if not exists custom_role_id uuid references public.rbac_roles(id) on delete set null;

create index if not exists idx_app_users_custom_role on public.app_users(custom_role_id);

-- ---------- per-module visibility for a custom role ----------
create table if not exists public.rbac_role_modules (
  role_id uuid not null references public.rbac_roles(id) on delete cascade,
  module_key text not null,
  can_view boolean not null default true,
  primary key (role_id, module_key)
);
alter table public.rbac_role_modules enable row level security;

drop policy if exists "rbac_role_modules_org_read" on public.rbac_role_modules;
create policy "rbac_role_modules_org_read" on public.rbac_role_modules
  for select to authenticated
  using (exists (select 1 from public.rbac_roles r where r.id = role_id and r.org_id = current_org_id()));

drop policy if exists "rbac_role_modules_admin_manage" on public.rbac_role_modules;
create policy "rbac_role_modules_admin_manage" on public.rbac_role_modules
  for all to authenticated
  using (
    hrms_current_role() = 'admin'
    and exists (select 1 from public.rbac_roles r where r.id = role_id and r.org_id = current_org_id())
  )
  with check (
    hrms_current_role() = 'admin'
    and exists (select 1 from public.rbac_roles r where r.id = role_id and r.org_id = current_org_id())
  );

-- ---------- close a gap in the 0033 grants policy ----------
-- Its WITH CHECK (which is what applies to INSERT/UPDATE) only checked that
-- the role belonged to the caller's org - not that the caller was an admin.
drop policy if exists "rbac_role_permissions_admin_manage" on public.rbac_role_permissions;
create policy "rbac_role_permissions_admin_manage" on public.rbac_role_permissions
  for all to authenticated
  using (
    hrms_current_role() = 'admin'
    and exists (select 1 from public.rbac_roles r where r.id = role_id and r.org_id = current_org_id())
  )
  with check (
    hrms_current_role() = 'admin'
    and exists (select 1 from public.rbac_roles r where r.id = role_id and r.org_id = current_org_id())
  );

-- ---------- ceiling: a custom role can never hold more than its base role ----------
create or replace function public.rbac_scope_rank(s public.rbac_scope)
returns int language sql immutable as $$
  select case s
    when 'organisation' then 6
    when 'business_unit' then 5
    when 'department' then 4
    when 'team' then 3
    when 'direct_reports' then 2
    when 'self' then 1
  end;
$$;

create or replace function public.enforce_custom_role_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.rbac_roles;
  v_base_id uuid;
begin
  select * into v_role from public.rbac_roles where id = new.role_id;
  if v_role.id is null or v_role.is_system then
    return new; -- built-in roles are edited directly by admins, as before
  end if;

  select id into v_base_id from public.rbac_roles
  where org_id = v_role.org_id and is_system and code = v_role.base_role::text;

  if v_base_id is null or not exists (
    select 1 from public.rbac_role_permissions bp
    where bp.role_id = v_base_id
      and bp.permission_id = new.permission_id
      and public.rbac_scope_rank(bp.scope) >= public.rbac_scope_rank(new.scope)
  ) then
    raise exception 'A custom role cannot be granted more than its base role (%) allows.', v_role.base_role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_custom_role_ceiling on public.rbac_role_permissions;
create trigger trg_enforce_custom_role_ceiling
  before insert or update on public.rbac_role_permissions
  for each row execute function public.enforce_custom_role_ceiling();

-- A built-in role's identity can't be changed into a custom one or vice versa.
create or replace function public.protect_role_identity()
returns trigger language plpgsql as $$
begin
  if new.is_system is distinct from old.is_system or new.base_role is distinct from old.base_role then
    raise exception 'A role''s type and base role cannot be changed after it is created.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_role_identity on public.rbac_roles;
create trigger trg_protect_role_identity
  before update on public.rbac_roles
  for each row execute function public.protect_role_identity();

-- ---------- keep app_users.role aligned with a custom role's base ----------
create or replace function public.align_app_user_with_custom_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.rbac_roles;
begin
  if new.custom_role_id is null then
    return new;
  end if;
  select * into v_role from public.rbac_roles where id = new.custom_role_id;
  if v_role.id is null or v_role.is_system or v_role.org_id is distinct from new.org_id then
    raise exception 'That custom role does not belong to this organisation.';
  end if;
  new.role := v_role.base_role;
  return new;
end;
$$;

drop trigger if exists trg_align_app_user_custom_role on public.app_users;
create trigger trg_align_app_user_custom_role
  before insert or update of role, custom_role_id, org_id on public.app_users
  for each row execute function public.align_app_user_with_custom_role();

-- Mirror the active role (custom if set, else the built-in) into
-- rbac_user_roles, which authorize_request() and the restrictive RLS read.
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

  insert into public.rbac_roles (org_id, code, name, description, is_system)
  values
    (new.org_id, 'admin', 'Administrator', 'Full HRMS administration', true),
    (new.org_id, 'hr', 'HR', 'Human resources operations', true),
    (new.org_id, 'manager', 'Manager', 'People manager access', true),
    (new.org_id, 'employee', 'Employee', 'Self-service access', true)
  on conflict (org_id, code) do nothing;

  if new.custom_role_id is not null then
    v_role_id := new.custom_role_id;
  else
    select id into v_role_id from public.rbac_roles
    where org_id = new.org_id and code = new.role::text and is_system;
  end if;

  if tg_op = 'UPDATE' and old.org_id is distinct from new.org_id then
    delete from public.rbac_user_roles where user_id = old.id and org_id = old.org_id;
  end if;

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
  after insert or delete or update of role, org_id, custom_role_id on public.app_users
  for each row execute function public.sync_rbac_user_role();
