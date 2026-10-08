-- Minimum staffing per branch: "every branch needs at least 1 Optometrist and
-- 2 Sales Assistants". A rule with no branch applies to every branch.

create table branch_staffing_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  branch_id uuid references branches(id) on delete cascade,
  job_title text not null check (length(trim(job_title)) > 0),
  min_count int not null check (min_count >= 1),
  created_at timestamptz not null default now(),
  unique (org_id, branch_id, job_title)
);
alter table branch_staffing_rules enable row level security;
create policy branch_staffing_hr on branch_staffing_rules for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy branch_staffing_read on branch_staffing_rules for select
  using (org_id = current_org_id() and hrms_current_role() = 'manager');
