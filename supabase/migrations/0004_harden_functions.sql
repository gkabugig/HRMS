-- Anonymous (unauthenticated) users have no legitimate reason to call these
-- RLS helper functions or the bootstrap RPC directly. `authenticated` still
-- needs EXECUTE on the four helpers because Postgres evaluates RLS policies
-- under the querying role's own privileges.

revoke execute on function public.hrms_current_role() from anon;
revoke execute on function public.current_org_id() from anon;
revoke execute on function public.current_employee_id() from anon;
revoke execute on function public.is_manager_of(uuid) from anon;
revoke execute on function public.bootstrap_admin(uuid, text) from anon;
