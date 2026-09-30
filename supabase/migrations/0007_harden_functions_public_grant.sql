-- 0004 revoked EXECUTE from `anon` specifically, but Postgres grants EXECUTE
-- on new functions to PUBLIC by default, and `anon` inherits PUBLIC
-- privileges — so the earlier revoke had no effect (confirmed via
-- has_function_privilege: anon could still execute all 5). Revoke from
-- PUBLIC too, then grant back only to `authenticated` (required for RLS
-- evaluation and the app's own direct calls where used).

revoke execute on function public.hrms_current_role() from public;
revoke execute on function public.current_org_id() from public;
revoke execute on function public.current_employee_id() from public;
revoke execute on function public.is_manager_of(uuid) from public;
revoke execute on function public.bootstrap_admin(uuid, text) from public;

grant execute on function public.hrms_current_role() to authenticated;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.is_manager_of(uuid) to authenticated;
grant execute on function public.bootstrap_admin(uuid, text) to authenticated;
