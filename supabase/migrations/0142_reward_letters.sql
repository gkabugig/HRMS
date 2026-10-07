-- Reward and promotion letters (rewards module, phase 7). A letter is filed
-- when an outcome is approved, but the employee only sees it from the release
-- date HR sets. Until then it is held.

create table reward_letters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  employee_id uuid not null references employees(id),
  recommendation_id uuid unique references reward_recommendations(id) on delete cascade,
  promotion_case_id uuid unique references promotion_cases(id) on delete cascade,
  letter_type text not null check (letter_type in ('merit','bonus','incentive','spot','retention','referral','long_service','promotion')),
  title text not null,
  body text not null,
  release_date date,                       -- null = held
  notified_at timestamptz,                 -- employee told it was released
  created_at timestamptz not null default now(),
  check (recommendation_id is not null or promotion_case_id is not null)
);
create index reward_letters_employee_idx on reward_letters(employee_id, release_date);
create index reward_letters_org_idx on reward_letters(org_id, release_date);

alter table reward_letters enable row level security;
create policy reward_letters_hr on reward_letters for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
-- The employee sees only their own letter, and only once released.
create policy reward_letters_self_read on reward_letters for select
  using (employee_id = current_employee_id() and release_date is not null and release_date <= current_date);

-- Promotion letters now go through the same release control.
drop policy if exists promotion_cases_self_read on promotion_cases;

-- Letters already issued before this change stay visible to the employee.
insert into reward_letters (org_id, employee_id, promotion_case_id, letter_type, title, body, release_date, notified_at)
select org_id, employee_id, id, 'promotion', 'Promotion to ' || proposed_title, letter_text, current_date, now()
from promotion_cases where status = 'Finalised' and letter_text is not null
on conflict do nothing;
