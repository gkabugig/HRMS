-- Supabase security advisor flagged enforce_document_retention (migration
-- 0081) for a mutable search_path. Pin it explicitly so the function can't
-- be tricked by a session-level search_path change into resolving
-- public.employee_documents to an attacker-controlled object.
alter function public.enforce_document_retention() set search_path = public, pg_temp;
