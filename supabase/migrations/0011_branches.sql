-- Multi-branch/location support. Nullable branch_id on employees so existing
-- single-site orgs (Lighthouse, PCEA Thindigua) aren't forced to assign one.

create table branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  location text,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table employees add column branch_id uuid references branches(id);

alter table branches enable row level security;

create policy "branches_hr_full" on branches
  for all using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- Everyone in the org can see the branch list (e.g. to read it on their own
-- employee record) — same shape as policies_read_all / leave_policies_read_all.
create policy "branches_read_all" on branches
  for select using (org_id = current_org_id());
