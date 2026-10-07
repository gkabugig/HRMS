-- Promotion engine (rewards module, phase 4): rules per grade step and
-- promotion cases. Approval runs through the shared approval engine; the
-- approved case updates grade, title and salary through the compensation
-- change flow and stores the letter.

create table promotion_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  from_grade_id uuid not null references compensation_grades(id),
  to_grade_id uuid not null references compensation_grades(id),
  config jsonb not null,
  is_active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (org_id, from_grade_id, to_grade_id),
  check (from_grade_id <> to_grade_id)
);

create table promotion_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  rule_id uuid references promotion_rules(id),
  from_grade_id uuid references compensation_grades(id),
  to_grade_id uuid not null references compensation_grades(id),
  current_title text,
  proposed_title text not null,
  current_salary numeric(14,2) not null,
  proposed_salary numeric(14,2) not null,
  effective_date date not null,
  gate_results jsonb not null default '[]'::jsonb,
  assessment jsonb not null default '{}'::jsonb,
  readiness_score numeric(5,1),
  readiness_label text,
  justification text,
  development_plan text,
  decision_reason text,
  letter_text text,
  status text not null default 'Draft' check (status in ('Draft','In Review','Approved','Rejected','Deferred','Finalised')),
  approval_request_id uuid references approval_requests(id),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index promotion_cases_org_idx on promotion_cases(org_id, status);
create index promotion_cases_employee_idx on promotion_cases(employee_id);
-- One live case per employee at a time.
create unique index promotion_cases_one_live on promotion_cases(employee_id) where status in ('Draft','In Review','Approved');

create or replace function promotion_no_self_case() returns trigger as $$
begin
  if auth.uid() is not null and new.employee_id = current_employee_id() then
    raise exception 'You cannot open or change a promotion case for yourself.';
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger trg_promotion_no_self_case before insert or update on promotion_cases
  for each row execute function promotion_no_self_case();

alter table promotion_rules enable row level security;
alter table promotion_cases enable row level security;

create policy promotion_rules_hr on promotion_rules for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy promotion_rules_read on promotion_rules for select
  using (hrms_current_role() = 'manager' and org_id = current_org_id());

create policy promotion_cases_hr on promotion_cases for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy promotion_cases_manager_read on promotion_cases for select
  using (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id));
create policy promotion_cases_manager_insert on promotion_cases for insert
  with check (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id));
create policy promotion_cases_manager_update on promotion_cases for update
  using (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id) and status = 'Draft')
  with check (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id));
-- The employee sees only their own finalised promotion (and so the letter).
create policy promotion_cases_self_read on promotion_cases for select
  using (employee_id = current_employee_id() and status = 'Finalised');
