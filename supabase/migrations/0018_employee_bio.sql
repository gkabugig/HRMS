-- Full employee bio: personal identity and contact details. Nothing like
-- this existed before — employee_contacts (0016) holds *other* people
-- (emergency/next-of-kin), and employees itself had no date of birth,
-- gender, ID number, nationality, marital status, or any contact field for
-- the employee. All additive/nullable so existing records aren't affected.
alter table employees add column date_of_birth date;
alter table employees add column gender text;
alter table employees add column marital_status text;
alter table employees add column national_id text;
alter table employees add column passport_no text;
alter table employees add column nationality text;
alter table employees add column personal_email text;
alter table employees add column phone_number text;
alter table employees add column physical_address text;
alter table employees add column postal_address text;

-- Same RLS posture as every other employee field: admin/hr full,
-- self-read/self-update, manager team-read (0002_rls.sql) — no new
-- policies needed since these are columns on the existing table, not a
-- new one.
