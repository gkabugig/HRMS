-- SKMG-HR demo data: a fictional Nairobi company with about 18 staff, three branches,
-- leave, attendance, notices, a survey with results, succession plans and more.
-- Loads into the organisation your administrator login belongs to. Every row it adds
-- has an id starting "de000000-", so demo_cleanup.sql removes exactly these and
-- nothing else. Safe to run twice: it clears its own earlier rows first.

create or replace function pg_temp.did(n int) returns uuid language sql immutable as
$$ select ('de000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

do $demo$
declare
  org uuid;
  monday date := date_trunc('week', current_date)::date;
begin
  select org_id into org from app_users where role = 'admin' limit 1;
  if (select count(distinct org_id) from app_users where role = 'admin') <> 1 then
    raise exception 'Expected exactly one organisation with an administrator.';
  end if;

  -- clear any earlier demo load
  delete from attendance where employee_id::text like 'de000000-%';
  delete from leave_requests where employee_id::text like 'de000000-%';
  delete from timesheets where employee_id::text like 'de000000-%';
  delete from checklist_items where employee_id::text like 'de000000-%';
  delete from wellbeing_checkins where employee_id::text like 'de000000-%';
  delete from wellbeing_resources where id::text like 'de000000-%';
  delete from surveys where id::text like 'de000000-%';
  delete from succession_plans where id::text like 'de000000-%';
  delete from branch_staffing_rules where id::text like 'de000000-%';
  delete from announcements where id::text like 'de000000-%';
  delete from org_events where id::text like 'de000000-%';
  delete from employees where id::text like 'de000000-%';
  delete from branches where id::text like 'de000000-%';

  -- branches
  insert into branches (id, org_id, name, location, latitude, longitude, geofence_radius_m) values
    (pg_temp.did(1), org, 'Nairobi Head Office', 'Westlands, Nairobi', -1.2676, 36.8108, 200),
    (pg_temp.did(2), org, 'Mombasa Branch', 'Nyali, Mombasa', -4.0435, 39.7120, 200),
    (pg_temp.did(3), org, 'Kisumu Branch', 'Milimani, Kisumu', -0.0917, 34.7680, 200);

  -- staff: (n, staff_no, name, dept, title, type, hired, manager n, basic, house, transport, branch n, gender, born)
  insert into employees (id, org_id, staff_no, name, department, job_title, employment_type, date_of_hire, reporting_manager_id,
                         basic, house_allowance, transport_allowance, branch_id, gender, date_of_birth, kra_pin, nssf_no, shif_no, phone_number)
  select pg_temp.did(100 + v.n), org, 'DEMO-' || lpad(v.n::text, 3, '0'), v.name, v.dept, v.title, v.etype::employment_type, v.hired,
         case when v.mgr is null then null else pg_temp.did(100 + v.mgr) end,
         v.basic, round(v.basic * 0.15), v.transport, pg_temp.did(v.br), v.gender, v.born,
         'A00' || lpad((1000000 + v.n)::text, 7, '0') || 'D', 'NSSF' || (900000 + v.n), 'SHIF' || (800000 + v.n), '07' || (10000000 + v.n * 1111)
  from (values
    (1,'Joseph Kamau','Management','General Manager','Permanent','2019-02-01'::date,null::int,250000,15000,1,'Male','1978-05-14'::date),
    (2,'Aisha Hassan','Finance','Finance Manager','Permanent','2020-03-02',1,150000,10000,1,'Female','1985-09-03'),
    (3,'Peter Otieno','Operations','Operations Manager','Permanent','2019-08-15',1,140000,10000,1,'Male','1983-01-22'),
    (4,'Mercy Njeri','Human Resources','HR Officer','Permanent','2021-01-11',1,95000,8000,1,'Female','1990-11-30'),
    (5,'David Mwangi','Sales','Sales Manager','Permanent','2020-06-01',1,135000,10000,1,'Male','1982-07-09'),
    (6,'Faith Chebet','Finance','Accountant','Permanent','2021-07-05',2,85000,7000,1,'Female','1991-04-18'),
    (7,'Brian Kiprop','Finance','Accounts Assistant','Permanent','2022-02-14',2,52000,5000,1,'Male','1996-12-02'),
    (8,'Lucy Akinyi','Operations','Branch Supervisor','Permanent','2020-10-19',3,90000,7000,2,'Female','1988-03-27'),
    (9,'Hassan Omar','Operations','Branch Supervisor','Permanent','2021-04-06',3,88000,7000,3,'Male','1987-08-16'),
    (10,'Esther Wanjiku','Sales','Sales Assistant','Permanent','2022-05-02',5,48000,4000,1,'Female','1997-02-11'),
    (11,'Kevin Odhiambo','Sales','Sales Assistant','Permanent','2022-09-12',5,46000,4000,1,'Male','1998-06-25'),
    (12,'Zainab Mohamed','Sales','Sales Assistant','Permanent','2023-01-16',8,45000,4000,2,'Female','1999-10-05'),
    (13,'Samuel Kibet','Sales','Sales Assistant','Contract','2023-06-05',8,44000,4000,2,'Male','2000-01-19'),
    (14,'Rose Atieno','Sales','Sales Assistant','Permanent','2023-03-20',9,45000,4000,3,'Female','1999-05-30'),
    (15,'Daniel Maina','Operations','Driver','Permanent','2021-11-01',3,38000,3500,1,'Male','1989-09-12'),
    (16,'Joyce Muthoni','Customer Service','Customer Care Officer','Permanent','2022-08-08',3,55000,5000,1,'Female','1995-07-07'),
    (17,'Ibrahim Salim','Customer Service','Customer Care Officer','Contract','2024-02-05',8,50000,5000,2,'Male','1997-11-21'),
    (18,'Naomi Jepkosgei','Human Resources','HR Assistant','Intern','2025-09-01',4,25000,2000,1,'Female','2002-03-08')
  ) as v(n, name, dept, title, etype, hired, mgr, basic, transport, br, gender, born);

  -- leave allowances (only if the organisation has none yet)
  insert into leave_policies (org_id, leave_type, annual_entitlement_days) values
    (org, 'Annual', 21), (org, 'Sick', 14), (org, 'Compassionate', 5), (org, 'Maternity', 90), (org, 'Paternity', 14)
  on conflict do nothing;

  -- leave: some taken, a few waiting for a decision
  insert into leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status, applied_on, decided_on) values
    (pg_temp.did(200), pg_temp.did(106), 'Annual', current_date - 60, current_date - 56, 5, 'Family visit upcountry', 'Approved', now() - interval '70 days', now() - interval '68 days'),
    (pg_temp.did(201), pg_temp.did(110), 'Sick', current_date - 21, current_date - 19, 3, 'Flu, medical note attached', 'Approved', now() - interval '21 days', now() - interval '20 days'),
    (pg_temp.did(202), pg_temp.did(112), 'Annual', current_date - 45, current_date - 41, 5, 'Wedding in Mombasa', 'Approved', now() - interval '60 days', now() - interval '58 days'),
    (pg_temp.did(203), pg_temp.did(108), 'Annual', current_date - 30, current_date - 26, 5, 'Rest', 'Approved', now() - interval '40 days', now() - interval '38 days'),
    (pg_temp.did(204), pg_temp.did(114), 'Compassionate', current_date - 14, current_date - 12, 3, 'Bereavement in the family', 'Approved', now() - interval '15 days', now() - interval '14 days'),
    (pg_temp.did(205), pg_temp.did(103), 'Annual', current_date + 14, current_date + 25, 10, 'December travel', 'Pending', now() - interval '2 days', null),
    (pg_temp.did(206), pg_temp.did(111), 'Annual', current_date + 7, current_date + 11, 5, 'Personal errands', 'Pending', now() - interval '1 day', null),
    (pg_temp.did(207), pg_temp.did(107), 'Sick', current_date, current_date + 1, 2, 'Dental procedure', 'Pending', now() - interval '3 hours', null),
    (pg_temp.did(208), pg_temp.did(116), 'Annual', current_date + 30, current_date + 36, 7, 'Visiting relatives in Kisumu', 'Rejected', now() - interval '10 days', now() - interval '8 days');

  -- attendance for the last 10 working days (a few late arrivals and absences)
  insert into attendance (employee_id, work_date, clock_in, clock_out, source)
  select e.id, d::date,
         (time '07:45' + ((abs(hashtext(e.id::text || d::text)) % 50) || ' minutes')::interval)::time,
         (time '17:00' + ((abs(hashtext(d::text || e.id::text)) % 40) || ' minutes')::interval)::time,
         'demo'
  from employees e
  cross join generate_series(current_date - 16, current_date - 1, interval '1 day') d
  where e.id::text like 'de000000-%'
    and extract(isodow from d) < 6
    and (abs(hashtext(e.id::text || d::text || 'x')) % 17) <> 0;

  -- noticeboard
  insert into announcements (id, org_id, title, body, audience, pinned, publish_at) values
    (pg_temp.did(300), org, 'Welcome to SKMG-HR', 'All staff requests now go through SKMG-HR: leave, attendance corrections, timesheets and HR queries. Open My Space from the menu to start.', 'all', true, now() - interval '5 days'),
    (pg_temp.did(301), org, 'December leave planning', 'Please submit year-end leave requests by the end of next week so managers can plan cover for every branch.', 'all', false, now() - interval '2 days'),
    (pg_temp.did(302), org, 'Managers: appraisal calibration', 'Calibration meetings run next week. Complete your team appraisals before then.', 'managers', false, now() - interval '1 day');

  insert into org_events (id, org_id, kind, title, description, starts_at, ends_at, location, join_url, recording_url, organiser) values
    (pg_temp.did(310), org, 'meeting', 'All-hands: quarter review', 'Results for the quarter and plans for the festive season.', now() + interval '3 days', now() + interval '3 days 1 hour', 'Boardroom and online', 'https://example.com/join/all-hands', null, 'Joseph Kamau'),
    (pg_temp.did(311), org, 'event', 'Staff end-of-year lunch', 'Lunch for all branches. Mombasa and Kisumu staff join by video.', now() + interval '40 days', null, 'Head Office canteen', null, null, 'Mercy Njeri'),
    (pg_temp.did(312), org, 'meeting', 'Health and safety briefing', 'Fire drill and first-aid refresher.', now() - interval '9 days', now() - interval '9 days' + interval '45 minutes', 'Online', 'https://example.com/join/safety', 'https://example.com/recordings/safety', 'Peter Otieno');

  -- succession and workforce planning
  insert into succession_plans (id, org_id, role_title, incumbent_id, criticality, vacancy_risk, notes) values
    (pg_temp.did(350), org, 'General Manager', pg_temp.did(101), 'high', 'low', 'Planned retirement in about four years.'),
    (pg_temp.did(351), org, 'Finance Manager', pg_temp.did(102), 'high', 'high', 'Key person risk: all banking approvals sit with one person.'),
    (pg_temp.did(352), org, 'Sales Manager', pg_temp.did(105), 'medium', 'medium', null);
  insert into succession_candidates (plan_id, employee_id, readiness, development_notes) values
    (pg_temp.did(350), pg_temp.did(103), 'one_to_two_years', 'Needs exposure to finance and board reporting'),
    (pg_temp.did(350), pg_temp.did(102), 'three_plus_years', null),
    (pg_temp.did(352), pg_temp.did(110), 'ready_now', 'Top seller two years running'),
    (pg_temp.did(352), pg_temp.did(108), 'one_to_two_years', 'Leadership course booked');

  insert into branch_staffing_rules (id, org_id, branch_id, job_title, min_count) values
    (pg_temp.did(360), org, null, 'Branch Supervisor', 1),
    (pg_temp.did(361), org, pg_temp.did(1), 'Sales Assistant', 2),
    (pg_temp.did(362), org, pg_temp.did(2), 'Sales Assistant', 2),
    (pg_temp.did(363), org, pg_temp.did(3), 'Sales Assistant', 2),
    (pg_temp.did(364), org, pg_temp.did(3), 'Customer Care Officer', 1);

  -- surveys: one closed with results, one open to answer
  insert into surveys (id, org_id, title, description, kind, status, closed_at) values
    (pg_temp.did(320), org, 'Staff pulse: September', 'A quick check on how the team is doing.', 'pulse', 'Closed', now() - interval '12 days'),
    (pg_temp.did(321), org, 'Engagement survey: Q4', 'Tell us what is working and what is not. Your answers are anonymous.', 'engagement', 'Open', null);
  insert into survey_questions (id, survey_id, position, prompt, qtype) values
    (pg_temp.did(330), pg_temp.did(320), 1, 'I understand what is expected of me at work.', 'scale'),
    (pg_temp.did(331), pg_temp.did(320), 2, 'My manager supports me.', 'scale'),
    (pg_temp.did(332), pg_temp.did(320), 3, 'I have the tools I need to do my job.', 'scale'),
    (pg_temp.did(333), pg_temp.did(320), 4, 'I would recommend this organisation as a place to work.', 'scale'),
    (pg_temp.did(334), pg_temp.did(320), 5, 'What one thing should we improve?', 'text'),
    (pg_temp.did(335), pg_temp.did(321), 1, 'I feel recognised for the work I do.', 'scale'),
    (pg_temp.did(336), pg_temp.did(321), 2, 'I see a future for myself here.', 'scale'),
    (pg_temp.did(337), pg_temp.did(321), 3, 'What would make your work easier?', 'text');
  insert into survey_participation (survey_id, employee_id)
    select pg_temp.did(320), pg_temp.did(100 + n) from generate_series(6, 14) n;
  -- answers carry no employee and no time: 9 anonymous responses
  insert into survey_answers (survey_id, question_id, response_key, scale_value)
    select pg_temp.did(320), pg_temp.did(329 + q), md5('demo-response-' || r)::uuid, 3 + (abs(hashtext(r::text || q::text)) % 3)
    from generate_series(1, 9) r cross join generate_series(1, 4) q;
  insert into survey_answers (survey_id, question_id, response_key, text_value)
    select pg_temp.did(320), pg_temp.did(334), md5('demo-response-' || r.n)::uuid, r.t
    from (values (1,'Faster approvals for small purchases'), (2,'More training opportunities'), (3,'Better internet at the Kisumu branch'),
                 (5,'Clearer communication on promotions')) as r(n, t);

  -- timesheets: last week approved, this week in progress
  insert into timesheets (id, org_id, employee_id, week_start, status, total_hours, submitted_at, decided_at)
    select pg_temp.did(370 + n), org, pg_temp.did(100 + n), monday - 7, 'Approved', 40, now() - interval '6 days', now() - interval '5 days'
    from unnest(array[6, 7, 10, 11, 16]) n;
  insert into timesheets (id, org_id, employee_id, week_start, status, total_hours)
    select pg_temp.did(390 + n), org, pg_temp.did(100 + n), monday, 'Draft', 16 from unnest(array[6, 10]) n;
  insert into timesheet_entries (timesheet_id, work_date, hours, project)
    select t.id, t.week_start + d, 8, (array['Month-end close','Client onboarding','Stock count','Customer follow-ups'])[1 + (abs(hashtext(t.id::text)) % 4)]
    from timesheets t cross join generate_series(0, 4) d
    where t.id::text like 'de000000-%' and t.status = 'Approved';
  insert into timesheet_entries (timesheet_id, work_date, hours, project)
    select t.id, t.week_start + d, 8, 'Client onboarding' from timesheets t cross join generate_series(0, 1) d
    where t.id::text like 'de000000-%' and t.status = 'Draft';

  -- checklist, wellbeing
  insert into checklist_items (org_id, employee_id, title, due_date, done_at)
    select org, pg_temp.did(100 + n), t, current_date + due, case when done then now() else null end
    from (values (6,'Reconcile the M-Pesa till',2,false), (6,'Submit VAT working papers',5,false), (6,'Update the fixed asset register',-3,true),
                 (10,'Call back three lapsed clients',1,false), (10,'Update the price list',4,false)) as c(n, t, due, done);
  insert into wellbeing_resources (id, org_id, title, body, url) values
    (pg_temp.did(380), org, 'Talk to HR in confidence', 'Speak to the HR office about workload, health or personal matters. Conversations are private.', null),
    (pg_temp.did(381), org, 'Take your leave', 'Rest helps. Plan your annual leave early so cover can be arranged.', null),
    (pg_temp.did(382), org, 'Employee assistance information', 'Details of counselling support available to staff and their families.', 'https://example.com/support');
  insert into wellbeing_checkins (org_id, employee_id, week_start, mood)
    select org, pg_temp.did(100 + n), w, 3 + (abs(hashtext(n::text || w::text)) % 3)
    from generate_series(6, 14) n cross join (select (monday - 7 * k) as w from generate_series(0, 3) k) ws;
end
$demo$;
