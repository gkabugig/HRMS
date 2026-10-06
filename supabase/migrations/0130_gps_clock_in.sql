-- GPS clock-in: branches get an optional map position + allowed radius, and
-- attendance rows record where a self clock-in/out happened and whether it
-- was inside that area. All nullable/additive - existing rows and orgs with
-- no coordinates set behave exactly as before (no location check).
alter table branches
  add column if not exists latitude double precision check (latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude between -180 and 180),
  add column if not exists geofence_radius_m integer not null default 150 check (geofence_radius_m > 0);

alter table attendance
  add column if not exists clock_in_lat double precision,
  add column if not exists clock_in_lng double precision,
  add column if not exists clock_in_distance_m integer,
  add column if not exists clock_in_in_geofence boolean,
  add column if not exists clock_out_lat double precision,
  add column if not exists clock_out_lng double precision,
  add column if not exists clock_out_distance_m integer,
  add column if not exists clock_out_in_geofence boolean;
