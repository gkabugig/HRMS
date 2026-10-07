-- 1. Default chain: any reward above KES 100,000 is signed off by the head of
--    the organisation after HR review. (For merit, the amount is the annual
--    cost.) HR can edit or remove it on the Approval chains tab.
insert into reward_approval_workflows (org_id, name, reward_type, min_amount, max_amount, exceptions_only, stages, due_days)
select o.id, 'Large rewards: head of organisation signs', '*', 100000.01, null, false, '["hr","head"]'::jsonb, 3
from organizations o
where not exists (select 1 from reward_approval_workflows w where w.org_id = o.id and w.name = 'Large rewards: head of organisation signs');

-- 2. Leavers: when an employee is terminated, any approved reward not yet in a
--    pay run is held for HR to decide. Payroll skips held rewards.
create or replace function reward_hold_for_leaver() returns trigger as $$
declare r record;
begin
  if new.status = 'Terminated' and old.status is distinct from 'Terminated' then
    for r in
      update reward_transactions set payroll_status = 'held'
      where employee_id = new.id and tx_type = 'earning' and payroll_status = 'pending'
      returning id, org_id, amount
    loop
      insert into reward_audit_events (org_id, event, record_type, record_id, after_json, reason)
      values (r.org_id, 'reward.held_for_leaver', 'reward_transaction', r.id, jsonb_build_object('amount', r.amount), 'Employee left before the payment date');
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_reward_hold_for_leaver on employees;
create trigger trg_reward_hold_for_leaver after update of status on employees
  for each row execute function reward_hold_for_leaver();
