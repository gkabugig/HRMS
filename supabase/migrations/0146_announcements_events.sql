-- Noticeboard and events: announcements everyone in the organisation can read,
-- and events or meetings with a join link and, afterwards, a recording link.
-- Only HR and administrators post. Managers-only notices are hidden from staff.

create table announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  title text not null check (length(trim(title)) > 0),
  body text not null,
  audience text not null default 'all' check (audience in ('all','managers')),
  pinned boolean not null default false,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index announcements_org_idx on announcements(org_id, publish_at desc);

create table org_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  kind text not null default 'event' check (kind in ('event','meeting')),
  title text not null check (length(trim(title)) > 0),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  join_url text,
  recording_url text,
  organiser text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index org_events_org_idx on org_events(org_id, starts_at desc);

alter table announcements enable row level security;
alter table org_events enable row level security;

create policy announcements_hr on announcements for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy announcements_read on announcements for select
  using (
    org_id = current_org_id()
    and publish_at <= now()
    and (expires_at is null or expires_at > now())
    and (audience = 'all' or hrms_current_role() in ('admin','hr','manager'))
  );

create policy org_events_hr on org_events for all
  using (hrms_current_role() in ('admin','hr') and org_id = current_org_id())
  with check (hrms_current_role() in ('admin','hr') and org_id = current_org_id());
create policy org_events_read on org_events for select
  using (org_id = current_org_id());
