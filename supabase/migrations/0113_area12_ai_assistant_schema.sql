-- Area 12: AI HR Assistant (spec §9.3)
--
-- RAG retrieval design decision (disclosed): the spec's RAG flow
-- (§9.7: classification/metadata -> chunking/index -> permission-aware
-- retrieval -> source-grounded generation -> source references) does not
-- mandate vector embeddings specifically. pgvector is available on this
-- project but NOT installed, and genuinely useful embeddings would require
-- a second external provider call (e.g. an embeddings API) on top of the
-- chat model the user has not yet configured either. To avoid a second
-- unconfigured dependency, retrieval here uses Postgres full-text search
-- (tsvector + pg_trgm fuzzy fallback) over ai_knowledge_chunks, which is
-- already installed/available and needs no external API key. This is
-- swappable for pgvector later without changing the chunk table's shape
-- (an embedding column can be added) if the user wants semantic search.
create extension if not exists pg_trgm;

-- ai_assistants: assistant configuration/policies
create table ai_assistants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  description text,
  system_prompt text not null,
  model text not null default 'claude-sonnet-4-5',
  is_active boolean not null default true,
  policies jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ai_conversations: conversation sessions
create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  assistant_id uuid not null references ai_assistants(id),
  user_id uuid not null references app_users(id),
  employee_id uuid references employees(id),
  title text,
  status text not null default 'active' check (status in ('active', 'closed')),
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- ai_messages: messages + safety metadata
create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text,
  tool_calls jsonb,
  tool_results jsonb,
  safety_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ai_tool_registry: approved tool contracts (the ONLY things the model may invoke)
create table ai_tool_registry (
  id uuid primary key default gen_random_uuid(),
  tool_name text not null unique,
  tool_type text not null check (tool_type in ('read', 'action')),
  description text not null,
  json_schema jsonb not null,
  handler_key text not null,
  requires_confirmation boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ai_tool_permissions: role/scope permissions per tool
create table ai_tool_permissions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references ai_tool_registry(id) on delete cascade,
  role text not null,
  is_allowed boolean not null default true,
  scope jsonb not null default '{}'::jsonb,
  unique (tool_id, role)
);

-- ai_knowledge_sources: RAG source registry
create table ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  source_type text not null check (source_type in ('policy_document', 'handbook', 'faq', 'procedure')),
  title text not null,
  classification text not null default 'internal' check (classification in ('public', 'internal', 'restricted')),
  is_active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ai_knowledge_chunks: indexed knowledge units
create table ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  source_id uuid not null references ai_knowledge_sources(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  token_count integer,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

-- ai_action_requests: pending/confirmed AI-initiated actions (spec §9.9 confirmation matrix)
create table ai_action_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  conversation_id uuid not null references ai_conversations(id),
  tool_name text not null references ai_tool_registry(tool_name),
  arguments jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'executed', 'rejected', 'expired')),
  requested_by uuid not null references app_users(id),
  confirmed_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- ai_action_events: AI action audit trail
create table ai_action_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  action_request_id uuid not null references ai_action_requests(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references app_users(id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ai_usage_events: usage and quality telemetry
create table ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  conversation_id uuid references ai_conversations(id),
  message_id uuid references ai_messages(id),
  event_type text not null check (event_type in ('model_call', 'tool_call', 'rag_retrieval', 'error')),
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ai_assistant_feedback: user feedback
create table ai_assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  conversation_id uuid not null references ai_conversations(id),
  message_id uuid references ai_messages(id),
  user_id uuid not null references app_users(id),
  rating text not null check (rating in ('up', 'down')),
  comment text,
  created_at timestamptz not null default now()
);

alter table ai_assistants enable row level security;
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;
alter table ai_tool_registry enable row level security;
alter table ai_tool_permissions enable row level security;
alter table ai_knowledge_sources enable row level security;
alter table ai_knowledge_chunks enable row level security;
alter table ai_action_requests enable row level security;
alter table ai_action_events enable row level security;
alter table ai_usage_events enable row level security;
alter table ai_assistant_feedback enable row level security;

-- ai_assistants: hr/admin manage; org members can read active assistants (to start a chat)
create policy ai_assistants_hr_admin_all on ai_assistants for all
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'))
  with check (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));
create policy ai_assistants_org_read on ai_assistants for select
  using (org_id = current_org_id() and is_active = true);

-- ai_conversations: owner reads/writes own; hr/admin read all (audit)
create policy ai_conversations_owner_all on ai_conversations for all
  using (org_id = current_org_id() and user_id = (select auth.uid()))
  with check (org_id = current_org_id() and user_id = (select auth.uid()));
create policy ai_conversations_hr_admin_read on ai_conversations for select
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));

-- ai_messages: owner of the parent conversation reads/writes; hr/admin read all
create policy ai_messages_owner_all on ai_messages for all
  using (
    org_id = current_org_id()
    and exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  )
  with check (
    org_id = current_org_id()
    and exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy ai_messages_hr_admin_read on ai_messages for select
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));

-- ai_tool_registry / ai_tool_permissions: global contract, admin-managed, readable by any authenticated org member (needed to drive the server-side gateway's allow-list check)
create policy ai_tool_registry_admin_write on ai_tool_registry for all
  using (hrms_current_role() = 'admin')
  with check (hrms_current_role() = 'admin');
create policy ai_tool_registry_authenticated_read on ai_tool_registry for select
  using ((select auth.role()) = 'authenticated');
create policy ai_tool_permissions_admin_write on ai_tool_permissions for all
  using (hrms_current_role() = 'admin')
  with check (hrms_current_role() = 'admin');
create policy ai_tool_permissions_authenticated_read on ai_tool_permissions for select
  using ((select auth.role()) = 'authenticated');

-- ai_knowledge_sources / ai_knowledge_chunks: hr/admin manage; org-wide read (classification filtering is enforced in the retrieval tool server-side, same pattern as documents)
create policy ai_knowledge_sources_hr_admin_write on ai_knowledge_sources for all
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'))
  with check (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));
create policy ai_knowledge_sources_org_read on ai_knowledge_sources for select
  using (org_id = current_org_id());
create policy ai_knowledge_chunks_hr_admin_write on ai_knowledge_chunks for all
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'))
  with check (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));
create policy ai_knowledge_chunks_org_read on ai_knowledge_chunks for select
  using (org_id = current_org_id());

-- ai_action_requests: requester reads/creates own; hr/admin all (to confirm/execute high-sensitivity ones)
create policy ai_action_requests_requester_create on ai_action_requests for insert
  with check (org_id = current_org_id() and requested_by = (select auth.uid()));
create policy ai_action_requests_requester_read on ai_action_requests for select
  using (org_id = current_org_id() and requested_by = (select auth.uid()));
create policy ai_action_requests_hr_admin_all on ai_action_requests for all
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'))
  with check (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));

-- ai_action_events: hr/admin read (audit); system/service role writes via server actions (no direct user insert policy needed beyond hr/admin)
create policy ai_action_events_hr_admin_all on ai_action_events for all
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'))
  with check (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));

-- ai_usage_events: hr/admin read all; owner can read own conversation's usage
create policy ai_usage_events_hr_admin_read on ai_usage_events for select
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));
create policy ai_usage_events_owner_read on ai_usage_events for select
  using (
    org_id = current_org_id()
    and exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy ai_usage_events_hr_admin_write on ai_usage_events for insert
  with check (org_id = current_org_id());

-- ai_assistant_feedback: owner creates/reads own; hr/admin read all
create policy ai_feedback_owner_all on ai_assistant_feedback for all
  using (org_id = current_org_id() and user_id = (select auth.uid()))
  with check (org_id = current_org_id() and user_id = (select auth.uid()));
create policy ai_feedback_hr_admin_read on ai_assistant_feedback for select
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));
