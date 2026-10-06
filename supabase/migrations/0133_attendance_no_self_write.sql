-- Attendance forgery fix. Employees could INSERT/UPDATE their own attendance
-- rows straight through the API, bypassing the server-side clock-in check
-- (Kenya time, GPS distance, geofence verdict) - e.g. back-dating a row or
-- marking themselves "on site". Clock-ins now go only through the server
-- action, which derives the employee from the session and writes with the
-- service role; HR/admin keep full access via attendance_hr_full, and
-- employees can still READ their own rows (attendance_self_read).
drop policy if exists "attendance_self_insert" on public.attendance;
drop policy if exists "attendance_self_update" on public.attendance;
