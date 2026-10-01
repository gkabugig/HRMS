-- Area 06 — thin wrapper so the manager-workspace scope resolver
-- (get-manager-scope.ts) can call this over supabase-js unambiguously.
-- rbac_granted_scopes() itself returns `setof rbac_scope` (0035), which
-- PostgREST's RPC endpoint wraps in a way that's been ambiguous to reason
-- about without live-testing the serialization; a plain text[] array
-- return, by contrast, is unambiguously serialized as a JSON string array
-- by PostgREST. Existing callers of rbac_granted_scopes() inside SQL
-- (array_agg(...) in user_can_access_employee etc., migration 0037) are
-- untouched — this adds a second, TS-facing entry point rather than
-- changing the original function's signature.
create or replace function public.rbac_granted_scopes_array(
  p_resource text,
  p_action public.rbac_action,
  p_sensitivity public.rbac_sensitivity default 'normal'
)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(s::text), array[]::text[])
  from public.rbac_granted_scopes(p_resource, p_action, p_sensitivity) s;
$$;
