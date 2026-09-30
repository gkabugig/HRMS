-- General document vault: contracts, ID copies, certificates, etc. per
-- employee. Same private-bucket + employee_id-path-segment RLS pattern as
-- disciplinary_attachments (0010) — HR/admin full access, employee reads
-- their own; deliberately no manager access, these are personal documents.

insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

create table employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  doc_type text not null default 'Other',
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references app_users(id),
  uploaded_at timestamptz not null default now()
);

alter table employee_documents enable row level security;

create policy "employee_documents_hr_full" on employee_documents
  for all using (hrms_current_role() in ('admin','hr'));

create policy "employee_documents_self_read" on employee_documents
  for select using (employee_id = current_employee_id());

create policy "employee_docs_hr_full" on storage.objects
  for all using (
    bucket_id = 'employee-documents' and hrms_current_role() in ('admin','hr')
  );

create policy "employee_docs_self_read" on storage.objects
  for select using (
    bucket_id = 'employee-documents'
    and ((storage.foldername(name))[1])::uuid = current_employee_id()
  );
