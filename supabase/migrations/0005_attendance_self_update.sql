-- Employees need to be able to update their own same-day attendance row
-- (e.g. adding clock_out after clock_in), which the upsert-on-conflict
-- pattern requires an UPDATE policy for, not just INSERT.

create policy "attendance_self_update" on attendance
  for update using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id());
