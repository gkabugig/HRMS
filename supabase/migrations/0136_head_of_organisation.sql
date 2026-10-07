-- Head of organisation (CEO) approval routing.
--
-- The CEO has no reporting manager, so nobody is "her manager" for approvals.
-- 1. Mark her explicitly (one head per organisation).
-- 2. A head never has a reporting manager.
-- 3. Nobody may approve/reject their own leave (this was possible for HR/admin).
-- 4. Leave of the head can only be decided by someone with the HR role.

alter table employees add column if not exists is_head_of_organisation boolean not null default false;

create unique index if not exists employees_one_head_per_org
  on employees (org_id) where is_head_of_organisation;

create or replace function employees_head_has_no_manager() returns trigger as $$
begin
  if new.is_head_of_organisation then
    new.reporting_manager_id := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_employees_head_has_no_manager on employees;
create trigger trg_employees_head_has_no_manager
  before insert or update on employees
  for each row execute function employees_head_has_no_manager();

create or replace function leave_decision_guard() returns trigger as $$
declare
  actor uuid := auth.uid();
  is_head boolean;
begin
  -- Only guard actual decisions made by a signed-in person (service-role
  -- and system updates have no auth.uid()).
  if actor is null or new.status is not distinct from old.status
     or new.status not in ('Approved', 'Rejected') then
    return new;
  end if;

  if new.employee_id = current_employee_id() then
    raise exception 'You cannot approve or reject your own leave request.';
  end if;

  select e.is_head_of_organisation into is_head from employees e where e.id = new.employee_id;
  if coalesce(is_head, false) and hrms_current_role() <> 'hr' then
    raise exception 'Leave for the head of the organisation must be approved by the HR Manager.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_leave_decision_guard on leave_requests;
create trigger trg_leave_decision_guard
  before update on leave_requests
  for each row execute function leave_decision_guard();
