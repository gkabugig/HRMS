-- Area 12 RAG retrieval functions (see src/lib/ai/rag.ts). SECURITY INVOKER
-- (the default) so these run as the calling user and are bound by
-- ai_knowledge_chunks'/ai_knowledge_sources' own RLS org-scoping - they are
-- a convenience for ranking/joining, not a privilege escalation.

create or replace function search_ai_knowledge_fts(
  p_org_id uuid,
  p_query text,
  p_limit int,
  p_include_restricted boolean
) returns table (chunk_id uuid, source_id uuid, source_title text, content text, rank real)
language sql
stable
set search_path = public
as $$
  select c.id, c.source_id, s.title, c.content,
         ts_rank(c.search_vector, websearch_to_tsquery('english', p_query)) as rank
  from ai_knowledge_chunks c
  join ai_knowledge_sources s on s.id = c.source_id
  where c.org_id = p_org_id
    and s.is_active = true
    and (p_include_restricted or s.classification <> 'restricted')
    and c.search_vector @@ websearch_to_tsquery('english', p_query)
  order by rank desc
  limit p_limit;
$$;

-- word_similarity finds the best-matching substring of the longer string
-- (the chunk) against the shorter/conversational query, which fits this
-- use case (a natural-language question vs. a longer indexed passage) far
-- better than whole-string similarity() did - confirmed via live smoke
-- test: "how much annual leave do I accrue" scored 0 under similarity()
-- but ranks meaningfully under word_similarity(). A low, explicit
-- threshold is used instead of relying on pg_trgm's global
-- similarity_threshold GUC.
create or replace function search_ai_knowledge_trgm(
  p_org_id uuid,
  p_query text,
  p_limit int,
  p_include_restricted boolean
) returns table (chunk_id uuid, source_id uuid, source_title text, content text, rank real)
language sql
stable
set search_path = public
as $$
  select c.id, c.source_id, s.title, c.content,
         word_similarity(p_query, c.content) as rank
  from ai_knowledge_chunks c
  join ai_knowledge_sources s on s.id = c.source_id
  where c.org_id = p_org_id
    and s.is_active = true
    and (p_include_restricted or s.classification <> 'restricted')
    and word_similarity(p_query, c.content) > 0.15
  order by rank desc
  limit p_limit;
$$;
