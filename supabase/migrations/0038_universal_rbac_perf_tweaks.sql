-- Universal RBAC — address the two performance advisories the new RBAC
-- tables/policies introduced (not pre-existing on this project):
--   1. auth_rls_initplan: wrap auth.uid() as (select auth.uid()) so Postgres
--      evaluates it once per statement instead of once per row.
--   2. unindexed_foreign_keys: add a covering index for the org_id FK on
--      rbac_user_roles and rbac_scope_overrides (the existing composite
--      index on rbac_user_roles has org_id as a non-leading column, which
--      doesn't serve FK-driven lookups/cascades efficiently).

drop policy if exists "rbac_user_roles_org_read" on public.rbac_user_roles;
create policy "rbac_user_roles_org_read" on public.rbac_user_roles
  for select to authenticated
  using (
    org_id = current_org_id()
    and (hrms_current_role() = any (array['admin','hr']::user_role[]) or user_id = (select auth.uid()))
  );

drop policy if exists "rbac_scope_overrides_self_read" on public.rbac_scope_overrides;
create policy "rbac_scope_overrides_self_read" on public.rbac_scope_overrides
  for select to authenticated
  using (
    org_id = current_org_id()
    and (hrms_current_role() = any (array['admin','hr']::user_role[]) or user_id = (select auth.uid()))
  );

create index if not exists idx_rbac_user_roles_org on public.rbac_user_roles(org_id);
create index if not exists idx_rbac_scope_overrides_org on public.rbac_scope_overrides(org_id);
