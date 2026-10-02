-- Lets a user attach a document to one AI Assistant conversation for the
-- model to read, separate from the org-wide indexed policy knowledge base
-- (ai_knowledge_sources/ai_knowledge_chunks). Text is extracted client-side
-- of the DB (see src/lib/ai/attachments.ts) and stored here already as
-- plain text - no raw file is kept in Storage, since nothing in this
-- feature needs the original bytes back, only the content for the model to
-- read. RLS mirrors ai_messages_owner_all / ai_messages_hr_admin_read
-- exactly (owner of the parent conversation reads/writes; hr/admin read all
-- for audit), since an attachment is conversation-scoped content just like
-- a message.
create table ai_conversation_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  uploaded_by uuid not null references app_users(id),
  file_name text not null,
  char_count int not null,
  content_text text not null,
  created_at timestamptz not null default now()
);
create index idx_ai_conversation_attachments_conversation on ai_conversation_attachments(conversation_id);

alter table ai_conversation_attachments enable row level security;

create policy ai_conversation_attachments_owner_all on ai_conversation_attachments for all
  using (
    org_id = current_org_id()
    and exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  )
  with check (
    org_id = current_org_id()
    and exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

create policy ai_conversation_attachments_hr_admin_read on ai_conversation_attachments for select
  using (org_id = current_org_id() and hrms_current_role() in ('admin', 'hr'));
