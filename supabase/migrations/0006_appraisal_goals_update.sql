-- appraisal_goals only had an HR "for all" policy plus a read-only policy
-- for the employee/manager. Employees need to set their own self_rating,
-- and managers need to set manager_rating on their team's goals — same
-- class of gap as the attendance self-update fix (0005).

create policy "appraisal_goals_self_rating_update" on appraisal_goals
  for update using (
    exists (
      select 1 from appraisals a
      where a.id = appraisal_id
        and a.employee_id = current_employee_id()
    )
  )
  with check (
    exists (
      select 1 from appraisals a
      where a.id = appraisal_id
        and a.employee_id = current_employee_id()
    )
  );

create policy "appraisal_goals_manager_rating_update" on appraisal_goals
  for update using (
    exists (
      select 1 from appraisals a
      where a.id = appraisal_id
        and hrms_current_role() = 'manager'
        and is_manager_of(a.employee_id)
    )
  )
  with check (
    exists (
      select 1 from appraisals a
      where a.id = appraisal_id
        and hrms_current_role() = 'manager'
        and is_manager_of(a.employee_id)
    )
  );
