-- Area 08: Document Lifecycle Management — core schema.
--
-- Per the spec's §34 Developer Handoff Note, this extends the EXISTING
-- document platform rather than creating a parallel one:
--   * employee_documents already IS the spec's "documents" table in
--     evolved form (doc_type/visibility/sensitivity/status/superseded_by/
--     requires_acknowledgement/archived_at already exist) — it is extended
--     in place with document_type_id, lifecycle_state, current_version_id,
--     title, owner_id, effective_date, retention_until, legal_hold,
--     archived_by. Its existing `status` column (Active/Superseded) is a
--     legacy storage-availability flag and is left untouched; the new
--     `lifecycle_state` column is the governed workflow state and is
--     intentionally kept separate from it, and from employee employment
--     status, per spec §5.
--   * document_acknowledgements, document_requests and document_access_logs
--     already exist (0064-era) and are reused as-is — NOT recreated.
--   * document_types, document_versions, document_expiries, document_events,
--     document_templates and document_shares are genuinely new and are
--     created here.
--   * disciplinary_attachments is a deliberately separate, already-locked-
--     down system (migration 0074) and is left alone — not a consolidation
--     candidate.
--
-- employee_documents has zero rows in production as of this migration, so
-- no backfill is required; this is a clean additive schema change.
--
-- All RLS below mirrors the existing employee_documents policy pattern
-- (hr_full / self_read / manager_visible / RESTRICTIVE RBAC gate calling
-- user_can_access_document()) so a document's versions, events and
-- expiries are never more visible than the parent document record.

-- ───────────────────────────── document_types ─────────────────────────────
-- Taxonomy + per-type lifecycle configuration. Per spec §20, expiry warning
-- schedules must be configurable per type, never hard-coded 90/60/30/7.
create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  default_sensitivity text not null default 'Confidential'
    check (default_sensitivity in ('Public', 'Internal', 'Confidential', 'Highly Restricted')),
  requires_acknowledgement boolean not null default false,
  acknowledgement_reset_on_new_version boolean not null default false,
  approval_required boolean not null default false,
  -- e.g. {90,60,30,7} — days before expiry_date to fire a warning. Empty
  -- array means "no automated expiry warnings for this type".
  expiry_warning_days_schedule int[] not null default '{}'::int[],
  retention_period_months int,
  is_active boolean not null default true,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

alter table public.document_types enable row level security;

create policy document_types_hr_full on public.document_types
  for all
  using (org_id = public.current_org_id() and public.hrms_current_role() in ('admin', 'hr'))
  with check (org_id = public.current_org_id() and public.hrms_current_role() in ('admin', 'hr'));

create policy document_types_org_read on public.document_types
  for select
  using (org_id = public.current_org_id());

-- ─────────────────────── employee_documents extensions ────────────────────
alter table public.employee_documents
  add column if not exists document_type_id uuid references public.document_types(id),
  add column if not exists lifecycle_state text not null default 'issued'
    check (lifecycle_state in (
      'draft', 'review', 'approved', 'issued', 'acknowledged',
      'returned', 'rejected', 'superseded', 'expired', 'voided', 'archived'
    )),
  add column if not exists current_version_id uuid,
  add column if not exists title text,
  add column if not exists owner_id uuid references public.employees(id),
  add column if not exists effective_date date,
  add column if not exists retention_until date,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists archived_by uuid references public.app_users(id);
  -- archived_at already exists (migration 0064) — intentionally not re-added.

create index if not exists idx_employee_documents_document_type_id on public.employee_documents(document_type_id);
create index if not exists idx_employee_documents_lifecycle_state on public.employee_documents(lifecycle_state);
create index if not exists idx_employee_documents_owner_id on public.employee_documents(owner_id);

-- ──────────────────────────── document_versions ────────────────────────────
-- Immutable version history. A new upload always creates a new row here —
-- never overwrites an issued version (spec §2, §10).
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.employee_documents(id) on delete cascade,
  version_number int not null,
  status text not null default 'issued'
    check (status in ('draft', 'review', 'approved', 'issued', 'rejected', 'returned', 'superseded', 'voided')),
  file_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid references public.app_users(id),
  uploaded_at timestamptz not null default now(),
  issued_at timestamptz,
  superseded_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create index if not exists idx_document_versions_document_id on public.document_versions(document_id);

alter table public.employee_documents
  add constraint employee_documents_current_version_fk
  foreign key (current_version_id) references public.document_versions(id);

alter table public.document_versions enable row level security;

create policy document_versions_hr_full on public.document_versions
  for all
  using (exists (
    select 1 from public.employee_documents ed
    join public.employees e on e.id = ed.employee_id
    where ed.id = document_versions.document_id and e.org_id = public.current_org_id()
  ) and public.hrms_current_role() in ('admin', 'hr'))
  with check (exists (
    select 1 from public.employee_documents ed
    join public.employees e on e.id = ed.employee_id
    where ed.id = document_versions.document_id and e.org_id = public.current_org_id()
  ) and public.hrms_current_role() in ('admin', 'hr'));

create policy document_versions_self_read on public.document_versions
  for select
  using (exists (
    select 1 from public.employee_documents ed
    where ed.id = document_versions.document_id and ed.employee_id = public.current_employee_id()
  ));

create policy document_versions_manager_visible on public.document_versions
  for select
  using (public.hrms_current_role() = 'manager' and exists (
    select 1 from public.employee_documents ed
    where ed.id = document_versions.document_id
      and ed.visibility = 'Manager'
      and public.is_manager_of(ed.employee_id)
  ));

create policy document_versions_select_rbac on public.document_versions
  as restrictive
  for select
  to authenticated
  using (exists (
    select 1 from public.employee_documents ed
    where ed.id = document_versions.document_id
      and public.user_can_access_document(ed.employee_id, 'view', 'confidential')
  ));

-- ──────────────────────────── document_expiries ────────────────────────────
-- One row per (document, warning threshold) — idempotency guard for the
-- expiry/renewal cron so a warning is never fired twice. Operational table,
-- HR/admin only; the cron evaluates it under the service role, which
-- bypasses RLS entirely.
create table if not exists public.document_expiries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.employee_documents(id) on delete cascade,
  warning_days int not null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, warning_days)
);

create index if not exists idx_document_expiries_document_id on public.document_expiries(document_id);

alter table public.document_expiries enable row level security;

create policy document_expiries_hr_full on public.document_expiries
  for all
  using (exists (
    select 1 from public.employee_documents ed
    join public.employees e on e.id = ed.employee_id
    where ed.id = document_expiries.document_id and e.org_id = public.current_org_id()
  ) and public.hrms_current_role() in ('admin', 'hr'))
  with check (exists (
    select 1 from public.employee_documents ed
    join public.employees e on e.id = ed.employee_id
    where ed.id = document_expiries.document_id and e.org_id = public.current_org_id()
  ) and public.hrms_current_role() in ('admin', 'hr'));

-- ───────────────────────────── document_events ─────────────────────────────
-- Business-timeline audit trail (distinct from the simpler, access-only
-- document_access_logs). Per spec §28, every material lifecycle/access
-- event must be recorded here with actor, org, document/version, event
-- type, timestamp and safe metadata.
create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.employee_documents(id) on delete cascade,
  version_id uuid references public.document_versions(id),
  event_type text not null,
  actor_id uuid references public.app_users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_events_document_id on public.document_events(document_id);
create index if not exists idx_document_events_org_id on public.document_events(org_id);

alter table public.document_events enable row level security;

create policy document_events_hr_full on public.document_events
  for all
  using (org_id = public.current_org_id() and public.hrms_current_role() in ('admin', 'hr'))
  with check (org_id = public.current_org_id() and public.hrms_current_role() in ('admin', 'hr'));

create policy document_events_self_read on public.document_events
  for select
  using (exists (
    select 1 from public.employee_documents ed
    where ed.id = document_events.document_id and ed.employee_id = public.current_employee_id()
  ));

create policy document_events_select_rbac on public.document_events
  as restrictive
  for select
  to authenticated
  using (exists (
    select 1 from public.employee_documents ed
    where ed.id = document_events.document_id
      and public.user_can_access_document(ed.employee_id, 'view', 'confidential')
  ));

-- Insert is open to any org member who can already see the document (or an
-- HR/admin actor) — this is how view/download/acknowledge events get
-- recorded by the actor's own authenticated request, never by a bypass.
create policy document_events_insert on public.document_events
  for insert
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.employee_documents ed
      where ed.id = document_events.document_id
        and (
          ed.employee_id = public.current_employee_id()
          or public.user_can_access_document(ed.employee_id, 'view', 'confidential')
          or public.hrms_current_role() in ('admin', 'hr')
        )
    )
  );

-- ─────────────────────────── document_templates ────────────────────────────
-- Controlled document generation (spec §22). Plain {{variable}} substitution
-- only — no template language with code-eval capability is introduced here
-- or anywhere in the generation service built on top of this table.
create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_type_id uuid references public.document_types(id),
  code text not null,
  name text not null,
  body text not null,
  version int not null default 1,
  is_active boolean not null default true,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

alter table public.document_templates enable row level security;

create policy document_templates_hr_full on public.document_templates
  for all
  using (org_id = public.current_org_id() and public.hrms_current_role() in ('admin', 'hr'))
  with check (org_id = public.current_org_id() and public.hrms_current_role() in ('admin', 'hr'));

-- ───────────────────────────── document_shares ─────────────────────────────
-- Temporary, token-gated shares. The table never stores a permanent public
-- URL — only a token; a dedicated security-definer redemption function
-- (added with the access service) mints a short-lived signed URL at access
-- time and enforces expiry/revocation/max-views, so no RLS policy here
-- grants anonymous access to the table itself.
create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.employee_documents(id) on delete cascade,
  version_id uuid references public.document_versions(id),
  token text not null unique,
  created_by uuid not null references public.app_users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_views int,
  view_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_shares_document_id on public.document_shares(document_id);

alter table public.document_shares enable row level security;

create policy document_shares_hr_full on public.document_shares
  for all
  using (public.hrms_current_role() in ('admin', 'hr') and exists (
    select 1 from public.employee_documents ed
    join public.employees e on e.id = ed.employee_id
    where ed.id = document_shares.document_id and e.org_id = public.current_org_id()
  ))
  with check (public.hrms_current_role() in ('admin', 'hr') and exists (
    select 1 from public.employee_documents ed
    join public.employees e on e.id = ed.employee_id
    where ed.id = document_shares.document_id and e.org_id = public.current_org_id()
  ));

-- ─────────────────────────── seed baseline types ───────────────────────────
-- A minimal starter taxonomy per existing org so the Document Centre UI
-- isn't empty on first load. HR can edit/add types afterwards.
insert into public.document_types (org_id, code, name, default_sensitivity, requires_acknowledgement, expiry_warning_days_schedule)
select o.id, t.code, t.name, t.sensitivity, t.requires_ack, t.schedule
from public.organizations o
cross join (values
  ('contract', 'Employment Contract', 'Confidential', true, array[90, 60, 30, 7]::int[]),
  ('id_document', 'National ID / Passport', 'Highly Restricted', false, array[90, 30]::int[]),
  ('certificate', 'Academic / Professional Certificate', 'Internal', false, array[]::int[]),
  ('policy_acknowledgement', 'Policy Acknowledgement', 'Internal', true, array[]::int[]),
  ('letter', 'HR Letter', 'Confidential', false, array[]::int[])
) as t(code, name, sensitivity, requires_ack, schedule)
on conflict (org_id, code) do nothing;
