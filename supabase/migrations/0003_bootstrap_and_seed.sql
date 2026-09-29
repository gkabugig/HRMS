-- Bootstrap: lets the very first signed-up user become admin of the org,
-- since app_users normally requires an existing admin to insert new rows.

create or replace function bootstrap_admin(p_org_id uuid, p_full_name text default null)
returns app_users as $$
declare
  result app_users;
begin
  if exists (select 1 from app_users where org_id = p_org_id) then
    raise exception 'Organization already has users; cannot bootstrap';
  end if;

  insert into app_users (id, org_id, role)
  values (auth.uid(), p_org_id, 'admin')
  returning * into result;

  return result;
end;
$$ language plpgsql security definer set search_path = public;

-- Default organization + statutory rates (Kenya, effective from today).
-- Adjust the org name to match the real client before going live.

insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default Organization')
on conflict (id) do nothing;

insert into statutory_rates (
  org_id, effective_from, paye_bands, personal_relief,
  nssf_tier1_ceiling, nssf_tier2_ceiling, nssf_rate,
  shif_rate, shif_min, housing_levy_rate
)
values (
  '00000000-0000-0000-0000-000000000001',
  current_date,
  '[{"upto":24000,"rate":0.10},{"upto":32333,"rate":0.25},{"upto":500000,"rate":0.30},{"upto":800000,"rate":0.325},{"upto":null,"rate":0.35}]'::jsonb,
  2400, 8000, 72000, 0.06, 0.0275, 300, 0.015
)
on conflict (org_id, effective_from) do nothing;

insert into leave_policies (org_id, leave_type, annual_entitlement_days) values
  ('00000000-0000-0000-0000-000000000001', 'Annual', 21),
  ('00000000-0000-0000-0000-000000000001', 'Sick', 14),
  ('00000000-0000-0000-0000-000000000001', 'Compassionate', 5),
  ('00000000-0000-0000-0000-000000000001', 'Maternity', 90),
  ('00000000-0000-0000-0000-000000000001', 'Paternity', 14),
  ('00000000-0000-0000-0000-000000000001', 'Unpaid', 0),
  ('00000000-0000-0000-0000-000000000001', 'Study', 10)
on conflict (org_id, leave_type) do nothing;
