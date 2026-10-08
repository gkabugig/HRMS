-- Succession planning: critical roles, who holds them, and who could take over.
-- HR and administrators only; this is sensitive and never shown to staff.

create table succession_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  role_title text not null check (length(trim(role_title)) > 0),
  incumbent_id uuid references employees(id),
  criticality text not null default 'medium' check (criticality in ('high','medium','low')),
  vacancy_risk text not null default 'low' check (vacancy_risk in ('high','medium','low')),
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create table succession_candidates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references succession_plans(id) on delete cascade,
  employee_id uuid not null references employees(id),
  readiness text not null check (readiness in ('ready_now','one_to_two_years','three_plus_years')),
  development_notes text,
  created_at timestamptz not null default now(),
  unique (plan_id, employee_id)
);
alter table succession_plans enable row level security;
alter table succession_candidates enable row level security;
create policy succession_plans_hr on succession_plans for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy succession_candidates_hr on succession_candidates for all
  using (hrms_current_role() in ('admin','hr') and exists (select 1 from succession_plans p where p.id = succession_candidates.plan_id and p.org_id = current_org_id()))
  with check (hrms_current_role() in ('admin','hr') and exists (select 1 from succession_plans p where p.id = succession_candidates.plan_id and p.org_id = current_org_id()));
