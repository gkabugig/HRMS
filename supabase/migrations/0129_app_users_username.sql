-- Username sign-in: accounts created with a username (instead of an email)
-- are stored in Supabase Auth under a synthetic internal email
-- "<username>@hrms.local" (see src/lib/auth/username.ts). This column just
-- records the username so Settings -> Manage Users can show it; sign-in
-- itself doesn't read it. Nullable: existing accounts signed up with a real
-- email and have no username.
alter table app_users add column if not exists username text;

create unique index if not exists uq_app_users_username
  on app_users (lower(username))
  where username is not null;
