-- Rewards, Bonus and Merit module (phases 1-3): policies, cycles, pools,
-- schemes, actuals, recommendations, payroll transactions and an
-- append-only audit trail. Reuses the existing compensation grades/bands,
-- the approval engine and the compensation change-request flow.

-- Grades gain a bonus target (% of annual base salary).
alter table compensation_grades add column if not exists bonus_target_pct numeric(5,2);

-- Payroll shows one-off earnings (bonus, incentive, award) separately.
alter table payslips add column if not exists one_off_earnings numeric(12,2) not null default 0;

-- ============ POLICIES (versioned, locked once used) ============
create table reward_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  version int not null,
  name text not null,
  config jsonb not null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (org_id, version)
);

-- ============ CYCLES ============
create table reward_cycles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  period_start date not null,
  period_end date not null,
  effective_date date not null,
  performance_cycle text not null,         -- matches appraisals.cycle
  policy_id uuid not null references reward_policies(id),
  company_factor numeric(5,3) not null default 1,
  status text not null default 'Planning' check (status in ('Planning','Open','Calibration','Approval','Finalised')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

-- A policy used by any cycle can no longer be edited (a new version is made).
create or replace function reward_policy_locked() returns trigger as $$
begin
  if exists (select 1 from reward_cycles where policy_id = old.id) then
    raise exception 'This policy is in use by a reward cycle. Create a new version instead.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;
create trigger trg_reward_policy_locked before update or delete on reward_policies
  for each row execute function reward_policy_locked();

-- ============ POOLS (budgets) ============
create table reward_pools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  cycle_id uuid references reward_cycles(id) on delete cascade,
  name text not null,
  pool_type text not null check (pool_type in ('merit','bonus','incentive','spot')),
  department text,
  approved_budget numeric(14,2) not null check (approved_budget >= 0),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ============ SCHEMES ============
create table reward_schemes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  scheme_type text not null check (scheme_type in ('sales','project','team','retention','referral','long_service','spot')),
  metric text,
  period text not null default 'monthly' check (period in ('monthly','quarterly','annual','one_off')),
  config jsonb not null,                    -- payout rule, threshold, cap, floor, tiers
  eligible jsonb not null default '{}'::jsonb, -- { departments: [], employee_ids: [] }
  pool_id uuid references reward_pools(id),
  is_active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table scheme_actuals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  scheme_id uuid not null references reward_schemes(id) on delete cascade,
  employee_id uuid not null references employees(id),
  period text not null,                     -- e.g. 2026-10 or 2026-Q4
  metric_value numeric(16,2) not null,
  source text not null default 'manual',
  status text not null default 'pending' check (status in ('pending','approved')),
  approved_by uuid references app_users(id),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (scheme_id, employee_id, period)
);

-- ============ RECOMMENDATIONS ============
create table reward_recommendations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  cycle_id uuid references reward_cycles(id) on delete cascade,
  scheme_id uuid references reward_schemes(id),
  pool_id uuid references reward_pools(id),
  employee_id uuid not null references employees(id),
  reward_type text not null check (reward_type in ('merit','bonus','incentive','spot','retention','referral','long_service')),
  calculated_amount numeric(14,2) not null default 0,   -- bonus/incentive/spot: payout. merit: monthly increase
  recommended_amount numeric(14,2) not null default 0,
  current_salary numeric(14,2),
  new_salary numeric(14,2),                              -- merit only
  pct numeric(7,3),                                      -- merit percentage
  snapshot jsonb not null default '{}'::jsonb,           -- every input behind the figure
  policy_version int,
  status text not null default 'Draft' check (status in ('Draft','Open','In Review','Calibration','Approved','Rejected','Finalised','Paid')),
  is_exception boolean not null default false,
  justification text,
  rejection_reason text,
  recommended_by uuid references app_users(id),
  approval_request_id uuid references approval_requests(id),
  version int not null default 1,
  payout_period text,                                    -- YYYY-MM for earnings
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reward_recs_cycle_idx on reward_recommendations(cycle_id, status);
create index reward_recs_employee_idx on reward_recommendations(employee_id);
create index reward_recs_org_idx on reward_recommendations(org_id, status);
-- One calculated merit/bonus per employee per cycle (re-calculation replaces it).
create unique index reward_recs_cycle_unique on reward_recommendations(cycle_id, employee_id, reward_type) where cycle_id is not null and scheme_id is null;

-- Nobody recommends a reward for themselves (spec §4).
create or replace function reward_no_self_reward() returns trigger as $$
begin
  if auth.uid() is not null and new.employee_id = current_employee_id() then
    raise exception 'You cannot recommend or change a reward for yourself.';
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger trg_reward_no_self_reward before insert or update on reward_recommendations
  for each row execute function reward_no_self_reward();

-- Committed / remaining are calculated from recommendations, never typed in.
-- For merit, recommended_amount is the ANNUAL cost of the increase.
create view reward_pool_status with (security_invoker = true) as
select p.id, p.org_id, p.cycle_id, p.name, p.pool_type, p.department, p.approved_budget,
  coalesce(sum(r.recommended_amount) filter (where r.status in ('Open','In Review','Calibration','Approved','Finalised','Paid')), 0)::numeric(14,2) as committed,
  coalesce(sum(r.recommended_amount) filter (where r.status in ('Approved','Finalised','Paid')), 0)::numeric(14,2) as approved,
  (p.approved_budget - coalesce(sum(r.recommended_amount) filter (where r.status in ('Open','In Review','Calibration','Approved','Finalised','Paid')), 0))::numeric(14,2) as remaining
from reward_pools p
left join reward_recommendations r on r.pool_id = p.id
group by p.id;

-- ============ TRANSACTIONS (what is sent to payroll / the pay record) ============
create table reward_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  recommendation_id uuid not null unique references reward_recommendations(id),  -- once only
  employee_id uuid not null references employees(id),
  tx_type text not null check (tx_type in ('earning','salary_change')),
  amount numeric(14,2) not null default 0,
  new_salary numeric(14,2),
  effective_date date not null,
  payroll_period text,
  payroll_status text not null default 'pending' check (payroll_status in ('pending','included','paid','held')),
  payroll_run_id uuid references payroll_runs(id),
  change_request_id uuid references compensation_change_requests(id),
  created_at timestamptz not null default now()
);
create index reward_tx_period_idx on reward_transactions(org_id, payroll_period, payroll_status);

-- ============ AUDIT (append only) ============
create table reward_audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  actor_user_id uuid references app_users(id),
  event text not null,
  record_type text not null,
  record_id uuid,
  before_json jsonb,
  after_json jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index reward_audit_org_idx on reward_audit_events(org_id, created_at desc);

create or replace function reward_audit_append_only() returns trigger as $$
begin
  raise exception 'The reward audit trail cannot be edited or deleted.';
end;
$$ language plpgsql;
create trigger trg_reward_audit_append_only before update or delete on reward_audit_events
  for each row execute function reward_audit_append_only();

-- ============ ROW-LEVEL SECURITY ============
alter table reward_policies enable row level security;
alter table reward_cycles enable row level security;
alter table reward_pools enable row level security;
alter table reward_schemes enable row level security;
alter table scheme_actuals enable row level security;
alter table reward_recommendations enable row level security;
alter table reward_transactions enable row level security;
alter table reward_audit_events enable row level security;

-- Configuration: HR/admin manage; managers can read cycles/policies/pools.
create policy reward_policies_hr on reward_policies for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy reward_policies_read on reward_policies for select
  using (hrms_current_role() = 'manager' and org_id = current_org_id());

create policy reward_cycles_hr on reward_cycles for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy reward_cycles_read on reward_cycles for select
  using (hrms_current_role() = 'manager' and org_id = current_org_id());

create policy reward_pools_hr on reward_pools for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy reward_schemes_hr on reward_schemes for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

create policy scheme_actuals_hr on scheme_actuals for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());

-- Recommendations: HR all; managers their direct reports only (read, insert,
-- update while still theirs to edit); employees only their own approved outcomes.
create policy reward_recs_hr on reward_recommendations for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy reward_recs_manager_read on reward_recommendations for select
  using (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id));
create policy reward_recs_manager_write on reward_recommendations for insert
  with check (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id));
create policy reward_recs_manager_update on reward_recommendations for update
  using (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id) and status in ('Draft','Open'))
  with check (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id));
create policy reward_recs_self_read on reward_recommendations for select
  using (employee_id = current_employee_id() and status in ('Approved','Finalised','Paid'));

create policy reward_tx_hr on reward_transactions for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy reward_tx_self_read on reward_transactions for select
  using (employee_id = current_employee_id());

create policy reward_audit_read on reward_audit_events for select
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy reward_audit_insert on reward_audit_events for insert
  with check (org_id = current_org_id());
