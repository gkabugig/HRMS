-- Pulse, engagement and wellbeing surveys. Answers are always anonymous: an
-- answer row carries no employee and no timestamp. A separate participation
-- table records only THAT someone responded (so nobody answers twice).
-- Results are shown only once enough people have responded.

create table surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  title text not null check (length(trim(title)) > 0),
  description text,
  kind text not null default 'pulse' check (kind in ('pulse','engagement','wellbeing')),
  status text not null default 'Draft' check (status in ('Draft','Open','Closed')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create table survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  position int not null,
  prompt text not null,
  qtype text not null default 'scale' check (qtype in ('scale','text')),
  unique (survey_id, position)
);
create table survey_participation (
  survey_id uuid not null references surveys(id) on delete cascade,
  employee_id uuid not null references employees(id),
  submitted_at timestamptz not null default now(),
  primary key (survey_id, employee_id)
);
create table survey_answers (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  question_id uuid not null references survey_questions(id) on delete cascade,
  response_key uuid not null,            -- groups one person's answers, linked to nobody
  scale_value int check (scale_value between 1 and 5),
  text_value text
);
create index survey_answers_survey_idx on survey_answers(survey_id, question_id);

alter table surveys enable row level security;
alter table survey_questions enable row level security;
alter table survey_participation enable row level security;
alter table survey_answers enable row level security;

create policy surveys_hr on surveys for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy surveys_open_read on surveys for select using (org_id = current_org_id() and status = 'Open');

create policy survey_questions_hr on survey_questions for all
  using (hrms_current_role() in ('admin','hr') and exists (select 1 from surveys s where s.id = survey_questions.survey_id and s.org_id = current_org_id()))
  with check (hrms_current_role() in ('admin','hr') and exists (select 1 from surveys s where s.id = survey_questions.survey_id and s.org_id = current_org_id() and s.status = 'Draft'));
create policy survey_questions_open_read on survey_questions for select
  using (exists (select 1 from surveys s where s.id = survey_questions.survey_id and s.org_id = current_org_id() and s.status = 'Open'));

create policy survey_participation_hr on survey_participation for select
  using (hrms_current_role() in ('admin','hr') and exists (select 1 from surveys s where s.id = survey_participation.survey_id and s.org_id = current_org_id()));
create policy survey_participation_self on survey_participation for select using (employee_id = current_employee_id());

-- Answers are written by the server only; HR reads them for the anonymous summary.
create policy survey_answers_hr_read on survey_answers for select
  using (hrms_current_role() in ('admin','hr') and exists (select 1 from surveys s where s.id = survey_answers.survey_id and s.org_id = current_org_id()));
