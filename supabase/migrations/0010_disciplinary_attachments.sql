-- File attachments for disciplinary records (warning letters, employee
-- written responses, etc). A private Storage bucket holds the files;
-- this table holds the metadata Postgres RLS can actually scope by role.
-- Storage object paths are "<employee_id>/<disciplinary_action_id>/<filename>"
-- so storage.objects policies can key off the employee_id path segment.

insert into storage.buckets (id, name, public)
values ('disciplinary-documents', 'disciplinary-documents', false)
on conflict (id) do nothing;

create table disciplinary_attachments (
  id uuid primary key default gen_random_uuid(),
  disciplinary_action_id uuid not null references disciplinary_actions(id) on delete cascade,
  employee_id uuid not null references employees(id),
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references app_users(id),
  uploaded_at timestamptz not null default now()
);

alter table disciplinary_attachments enable row level security;

create policy "disciplinary_attachments_hr_full" on disciplinary_attachments
  for all using (hrms_current_role() in ('admin','hr'));

create policy "disciplinary_attachments_manager_team_read" on disciplinary_attachments
  for select using (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "disciplinary_attachments_manager_insert" on disciplinary_attachments
  for insert with check (hrms_current_role() = 'manager' and is_manager_of(employee_id));

create policy "disciplinary_attachments_self_read" on disciplinary_attachments
  for select using (employee_id = current_employee_id());

-- Storage RLS, keyed off the first path segment (employee_id) of the
-- object name, mirroring the table policies above.
create policy "disciplinary_docs_hr_full" on storage.objects
  for all using (
    bucket_id = 'disciplinary-documents' and hrms_current_role() in ('admin','hr')
  );

create policy "disciplinary_docs_manager_read" on storage.objects
  for select using (
    bucket_id = 'disciplinary-documents'
    and hrms_current_role() = 'manager'
    and is_manager_of(((storage.foldername(name))[1])::uuid)
  );

create policy "disciplinary_docs_manager_insert" on storage.objects
  for insert with check (
    bucket_id = 'disciplinary-documents'
    and hrms_current_role() = 'manager'
    and is_manager_of(((storage.foldername(name))[1])::uuid)
  );

create policy "disciplinary_docs_self_read" on storage.objects
  for select using (
    bucket_id = 'disciplinary-documents'
    and ((storage.foldername(name))[1])::uuid = current_employee_id()
  );
