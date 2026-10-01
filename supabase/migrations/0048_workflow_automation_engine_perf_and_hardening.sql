-- Follow-up from the security/performance advisors run right after 0047:
-- (1) covering indexes for the denormalized org_id FKs (and the one
--     workflow_version_id FK on workflow_transitions) flagged as unindexed
--     — same housekeeping Area 02 did in 0044;
-- (2) pin search_path on the two new trigger functions, flagged as
--     "mutable search_path" — matches the hardening already applied to
--     every other SECURITY DEFINER/trigger function in this schema.
create index if not exists idx_workflow_versions_org on public.workflow_versions(org_id);
create index if not exists idx_workflow_triggers_org on public.workflow_triggers(org_id);
create index if not exists idx_workflow_nodes_org on public.workflow_nodes(org_id);
create index if not exists idx_workflow_transitions_org on public.workflow_transitions(org_id);
create index if not exists idx_workflow_transitions_version on public.workflow_transitions(workflow_version_id);
create index if not exists idx_workflow_run_nodes_org on public.workflow_run_nodes(org_id);
create index if not exists idx_workflow_events_org on public.workflow_events(org_id);

create or replace function public.workflow_version_immutability_guard()
returns trigger
language plpgsql
set search_path = public
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

create or replace function public.workflow_version_self_immutability_guard()
returns trigger
language plpgsql
set search_path = public
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
