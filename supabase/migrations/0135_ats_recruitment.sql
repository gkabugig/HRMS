-- Recruitment becomes a proper applicant-tracking flow: requisition approval,
-- published jobs + public applications, candidate details and CVs, a stage
-- history with rejection reasons, interviews + scorecards, and offers.
-- Re-runnable.

-- ---- stages: a public application starts at "Applied" ----
alter type candidate_stage add value if not exists 'Applied' before 'Screened';

-- ---- requisitions: job ad content, publishing, approval ----
alter table requisitions add column if not exists description text;
alter table requisitions add column if not exists requirements text;
alter table requisitions add column if not exists location text;
alter table requisitions add column if not exists employment_type text not null default 'Permanent';
alter table requisitions add column if not exists closing_date date;
alter table requisitions add column if not exists published boolean not null default false;
-- Existing requisitions were already in use, so they count as approved.
alter table requisitions add column if not exists approval_status text not null default 'Approved'
  check (approval_status in ('Pending','Approved','Rejected'));
alter table requisitions add column if not exists requested_by uuid references app_users(id);
alter table requisitions add column if not exists approved_by uuid references app_users(id);
alter table requisitions add column if not exists approved_at timestamptz;
alter table requisitions add column if not exists approval_note text;

-- ---- candidates: contact details, CV, notes, outcome ----
alter table candidates add column if not exists email text;
alter table candidates add column if not exists phone text;
alter table candidates add column if not exists cv_path text;
alter table candidates add column if not exists notes text;
alter table candidates add column if not exists rejection_reason text;
alter table candidates add column if not exists applied_via text not null default 'manual'
  check (applied_via in ('manual','careers'));
alter table candidates add column if not exists data_consent_at timestamptz;
alter table candidates add column if not exists stage_changed_at timestamptz not null default now();
create unique index if not exists candidates_one_email_per_job
  on candidates (requisition_id, lower(email)) where email is not null;

-- ---- stage history (who moved whom, when, why) ----
create table if not exists candidate_stage_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  from_stage candidate_stage,
  to_stage candidate_stage not null,
  reason text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_candidate_stage_history_candidate on candidate_stage_history(candidate_id, changed_at);
alter table candidate_stage_history enable row level security;

drop policy if exists "csh_hr_read" on candidate_stage_history;
create policy "csh_hr_read" on candidate_stage_history
  for select using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id())
  );
drop policy if exists "csh_manager_read" on candidate_stage_history;
create policy "csh_manager_read" on candidate_stage_history
  for select using (
    hrms_current_role() = 'manager'
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id() and r.hiring_manager_id = current_employee_id())
  );

create or replace function candidates_stage_before() returns trigger
language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end $$;

create or replace function candidates_stage_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into candidate_stage_history(candidate_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.stage, auth.uid());
  elsif new.stage is distinct from old.stage then
    insert into candidate_stage_history(candidate_id, from_stage, to_stage, reason, changed_by)
    values (new.id, old.stage, new.stage, case when new.stage = 'Rejected' then new.rejection_reason end, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_candidates_stage_before on candidates;
create trigger trg_candidates_stage_before before update on candidates
  for each row execute function candidates_stage_before();
drop trigger if exists trg_candidates_stage_after on candidates;
create trigger trg_candidates_stage_after after insert or update on candidates
  for each row execute function candidates_stage_after();

-- ---- interviews ----
create table if not exists candidate_interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  scheduled_at timestamptz not null,
  mode text not null default 'In person',
  location text,
  panel_user_ids uuid[] not null default '{}',
  notes text,
  status text not null default 'Scheduled' check (status in ('Scheduled','Completed','Cancelled')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_candidate_interviews_candidate on candidate_interviews(candidate_id);
alter table candidate_interviews enable row level security;

drop policy if exists "interviews_hr_full" on candidate_interviews;
create policy "interviews_hr_full" on candidate_interviews
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id())
  ) with check (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id())
  );
drop policy if exists "interviews_panel_read" on candidate_interviews;
create policy "interviews_panel_read" on candidate_interviews
  for select using (
    hrms_current_role() = 'manager'
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id()
                  and (r.hiring_manager_id = current_employee_id() or auth.uid() = any (panel_user_ids)))
  );

-- ---- scorecards: one per interviewer per candidate ----
create table if not exists interview_scorecards (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  interviewer_id uuid not null references app_users(id),
  skills int not null check (skills between 1 and 5),
  experience int not null check (experience between 1 and 5),
  communication int not null check (communication between 1 and 5),
  culture_fit int not null check (culture_fit between 1 and 5),
  recommendation text not null check (recommendation in ('Strong yes','Yes','No','Strong no')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, interviewer_id)
);
alter table interview_scorecards enable row level security;

drop policy if exists "scorecards_hr_full" on interview_scorecards;
create policy "scorecards_hr_full" on interview_scorecards
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id())
  ) with check (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id())
  );
-- A hiring manager can read the scores for their own hire and write their own card.
drop policy if exists "scorecards_manager_read" on interview_scorecards;
create policy "scorecards_manager_read" on interview_scorecards
  for select using (
    hrms_current_role() = 'manager'
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id() and r.hiring_manager_id = current_employee_id())
  );
drop policy if exists "scorecards_manager_write" on interview_scorecards;
create policy "scorecards_manager_write" on interview_scorecards
  for insert with check (
    hrms_current_role() = 'manager'
    and interviewer_id = auth.uid()
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id() and r.hiring_manager_id = current_employee_id())
  );
drop policy if exists "scorecards_manager_update" on interview_scorecards;
create policy "scorecards_manager_update" on interview_scorecards
  for update using (hrms_current_role() = 'manager' and interviewer_id = auth.uid())
  with check (hrms_current_role() = 'manager' and interviewer_id = auth.uid());

-- ---- offers (HR/admin only: they carry pay) ----
create table if not exists candidate_offers (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  salary numeric(14,2),
  start_date date,
  terms text,
  status text not null default 'Draft' check (status in ('Draft','Sent','Accepted','Declined','Withdrawn')),
  sent_on date,
  responded_on date,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_candidate_offers_candidate on candidate_offers(candidate_id);
alter table candidate_offers enable row level security;

drop policy if exists "offers_hr_full" on candidate_offers;
create policy "offers_hr_full" on candidate_offers
  for all using (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id())
  ) with check (
    hrms_current_role() in ('admin','hr')
    and exists (select 1 from candidates c join requisitions r on r.id = c.requisition_id
                where c.id = candidate_id and r.org_id = current_org_id())
  );

-- ---- CV storage: private bucket, path "<requisition_id>/<candidate_id>/<file>" ----
insert into storage.buckets (id, name, public)
values ('candidate-cvs', 'candidate-cvs', false)
on conflict (id) do nothing;

drop policy if exists "candidate_cvs_hr_read" on storage.objects;
create policy "candidate_cvs_hr_read" on storage.objects
  for select using (
    bucket_id = 'candidate-cvs'
    and hrms_current_role() in ('admin','hr')
    and exists (select 1 from requisitions r
                where r.id::text = (storage.foldername(name))[1] and r.org_id = current_org_id())
  );
drop policy if exists "candidate_cvs_manager_read" on storage.objects;
create policy "candidate_cvs_manager_read" on storage.objects
  for select using (
    bucket_id = 'candidate-cvs'
    and hrms_current_role() = 'manager'
    and exists (select 1 from requisitions r
                where r.id::text = (storage.foldername(name))[1]
                  and r.org_id = current_org_id() and r.hiring_manager_id = current_employee_id())
  );
