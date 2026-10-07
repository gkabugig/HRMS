-- Configurable reward approval chains and amendments (rewards module, phase 6).
-- Delegation and SLA escalation already live in the shared approval engine;
-- chains set the stages and the due date that drives escalation.

create table reward_approval_workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  reward_type text not null default '*' check (reward_type in ('*','merit','bonus','incentive','spot','retention','referral','long_service')),
  min_amount numeric(14,2) not null default 0,
  max_amount numeric(14,2),
  exceptions_only boolean not null default false,
  stages jsonb not null,                       -- ordered: "hr" | "admin" | "head"
  due_days int not null default 3 check (due_days between 1 and 60),
  is_active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  check (max_amount is null or max_amount >= min_amount)
);
create index reward_approval_workflows_org_idx on reward_approval_workflows(org_id, is_active);

-- Earlier versions of a recommendation, kept when an amendment reopens it.
create table reward_recommendation_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  recommendation_id uuid not null references reward_recommendations(id) on delete cascade,
  version int not null,
  row_json jsonb not null,
  reason text not null,
  amended_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index reward_rec_versions_idx on reward_recommendation_versions(recommendation_id, version);

create or replace function reward_versions_append_only() returns trigger as $$
begin
  raise exception 'Earlier versions cannot be changed or deleted.';
end;
$$ language plpgsql;
create trigger trg_reward_versions_append_only before update or delete on reward_recommendation_versions
  for each row execute function reward_versions_append_only();

alter table reward_approval_workflows enable row level security;
alter table reward_recommendation_versions enable row level security;

create policy reward_workflows_hr on reward_approval_workflows for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy reward_workflows_read on reward_approval_workflows for select
  using (org_id = current_org_id() and hrms_current_role() = 'manager');
create policy reward_versions_hr on reward_recommendation_versions for select
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy reward_versions_hr_insert on reward_recommendation_versions for insert
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
