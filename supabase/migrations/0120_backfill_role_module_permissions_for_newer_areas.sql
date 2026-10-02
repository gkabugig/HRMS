-- Bug found live: role_module_permissions stores an explicit per-org,
-- per-role allow-list. dashboard/layout.tsx uses DEFAULT_VISIBLE_MODULES
-- (which includes every newly-added module for admin/hr) ONLY as a
-- fallback when an org has zero rows in this table at all. Any org that
-- already had explicit rows seeded (e.g. "Default Organization", seeded
-- before Areas 11/12/16/17 existed) never got rows for the module keys
-- those areas introduced - so even admins on that org never see them,
-- regardless of what the code's ALL_MODULES list contains.
--
-- Confirmed live: "Default Organization" was missing exactly 5 keys that
-- don't exist in any pre-Area-11 migration: assistant, compensation,
-- manager-compensation, positions, risk.
--
-- This backfills those 5 keys for every org that already has explicit
-- role_module_permissions rows (orgs with none at all already fall back
-- to DEFAULT_VISIBLE_MODULES in code and need no fix), matching exactly
-- what DEFAULT_VISIBLE_MODULES in roles.ts grants each role:
--   admin / hr: all 5 keys
--   manager: assistant, manager-compensation, risk only
--   employee: assistant only
insert into role_module_permissions (org_id, role, module_key, can_view)
select o.id, r.role::user_role, k.module_key, true
from organizations o
cross join (values ('admin'), ('hr'), ('manager'), ('employee')) as r(role)
cross join (values ('assistant'), ('compensation'), ('manager-compensation'), ('positions'), ('risk')) as k(module_key)
where exists (select 1 from role_module_permissions rmp where rmp.org_id = o.id)
  and (
    r.role in ('admin', 'hr')
    or (r.role = 'manager' and k.module_key in ('assistant', 'manager-compensation', 'risk'))
    or (r.role = 'employee' and k.module_key = 'assistant')
  )
on conflict (org_id, role, module_key) do nothing;
