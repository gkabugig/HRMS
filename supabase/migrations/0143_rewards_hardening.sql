-- Rewards hardening (phase 9): tighten what each role can write or see.

-- 1. Only HR and managers may write audit events directly (the server uses
--    the service role for system events). Employees can no longer insert them.
drop policy if exists reward_audit_insert on reward_audit_events;
create policy reward_audit_insert on reward_audit_events for insert
  with check (org_id = current_org_id() and hrms_current_role() in ('admin','hr','manager'));

-- 2. A manager can only keep their reports' recommendations in the manager
--    states. They cannot mark one Approved, Finalised or Paid.
drop policy if exists reward_recs_manager_write on reward_recommendations;
create policy reward_recs_manager_write on reward_recommendations for insert
  with check (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id) and status in ('Draft','Open'));
drop policy if exists reward_recs_manager_update on reward_recommendations;
create policy reward_recs_manager_update on reward_recommendations for update
  using (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id) and status in ('Draft','Open'))
  with check (hrms_current_role() = 'manager' and org_id = current_org_id() and is_manager_of(employee_id) and status in ('Draft','Open','In Review'));

-- 3. Employees see an outcome only after HR has released its letter.
drop policy if exists reward_recs_self_read on reward_recommendations;
create policy reward_recs_self_read on reward_recommendations for select
  using (employee_id = current_employee_id() and status in ('Approved','Finalised','Paid')
    and exists (select 1 from reward_letters l where l.recommendation_id = reward_recommendations.id and l.release_date is not null and l.release_date <= current_date));
drop policy if exists reward_tx_self_read on reward_transactions;
create policy reward_tx_self_read on reward_transactions for select
  using (employee_id = current_employee_id()
    and exists (select 1 from reward_letters l where l.recommendation_id = reward_transactions.recommendation_id and l.release_date is not null and l.release_date <= current_date));
