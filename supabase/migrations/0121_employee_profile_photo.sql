-- Profile photo for the Employee 360 header/overview. Public bucket (a
-- profile photo isn't sensitive PII the way documents/payslips are), so it
-- renders with a plain <img src> and no signed-URL round trip is needed on
-- every page that shows an avatar. One current photo per employee: path is
-- always {employee_id}/photo.{ext}, uploaded with upsert so a re-upload
-- just replaces it rather than accumulating old files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-photos', 'employee-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

alter table employees add column if not exists photo_path text;

-- Write access: HR/admin for any employee in their org, or an employee for
-- their own photo - same self-or-hr shape as employees_self_update /
-- employees_hr_full on the employees table itself.
create policy "employee_photos_hr_write" on storage.objects
  for all using (
    bucket_id = 'employee-photos' and hrms_current_role() in ('admin','hr')
  )
  with check (
    bucket_id = 'employee-photos' and hrms_current_role() in ('admin','hr')
  );

create policy "employee_photos_self_write" on storage.objects
  for all using (
    bucket_id = 'employee-photos'
    and ((storage.foldername(name))[1])::uuid = current_employee_id()
  )
  with check (
    bucket_id = 'employee-photos'
    and ((storage.foldername(name))[1])::uuid = current_employee_id()
  );

-- Belt-and-braces authenticated read (the bucket's public:true flag already
-- serves objects via the public URL endpoint without consulting RLS, but
-- this covers any authenticated-client read path too).
create policy "employee_photos_authenticated_read" on storage.objects
  for select using (bucket_id = 'employee-photos');
