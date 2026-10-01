// Area 12 §9.7 RAG flow: approved source -> classification/metadata ->
// chunking/index -> permission-aware retrieval -> source-grounded
// generation -> source references in response.
//
// Retrieval design (disclosed, see migration 0113's header comment):
// Postgres full-text search (tsvector, already indexed via
// ai_knowledge_chunks.search_vector) with a pg_trgm similarity fallback for
// fuzzy/typo'd queries, rather than vector embeddings — pgvector is not
// installed on this project and real embeddings would need a second,
// equally unconfigured external API. This is swappable later without
// changing ai_knowledge_chunks' shape.
//
// Permission-aware: this always runs on the caller's own session client,
// so ai_knowledge_chunks' org-wide RLS read policy already confines results
// to the caller's organisation; "restricted" classification sources are
// additionally filtered out here unless the caller is HR/admin, mirroring
// the document-sensitivity pattern used elsewhere in this app.

import type { SupabaseClient } from "@supabase/supabase-js";

export type KnowledgeResult = {
  chunk_id: string;
  source_id: string;
  source_title: string;
  content: string;
  rank: number;
};

export async function searchKnowledge(supabase: SupabaseClient, orgId: string, query: string, limit = 5): Promise<KnowledgeResult[]> {
  const { data: appUser } = await supabase.auth.getUser();
  const { data: role } = appUser.user ? await supabase.from("app_users").select("role").eq("id", appUser.user.id).maybeSingle() : { data: null };
  const isHrOrAdmin = role?.role === "admin" || role?.role === "hr";

  // Primary: full-text search via websearch_to_tsquery, ranked.
  const { data: ftsRows, error: ftsError } = await supabase.rpc("search_ai_knowledge_fts", {
    p_org_id: orgId,
    p_query: query,
    p_limit: limit,
    p_include_restricted: isHrOrAdmin,
  });

  if (!ftsError && ftsRows && ftsRows.length > 0) {
    return (ftsRows as Array<Record<string, unknown>>).map((r) => ({
      chunk_id: r.chunk_id as string,
      source_id: r.source_id as string,
      source_title: r.source_title as string,
      content: r.content as string,
      rank: Number(r.rank),
    }));
  }

  // Fallback: pg_trgm similarity (handles typos / near-miss phrasing that
  // tsquery's exact-stem matching misses).
  const { data: trgmRows } = await supabase.rpc("search_ai_knowledge_trgm", {
    p_org_id: orgId,
    p_query: query,
    p_limit: limit,
    p_include_restricted: isHrOrAdmin,
  });
  return ((trgmRows as Array<Record<string, unknown>>) || []).map((r) => ({
    chunk_id: r.chunk_id as string,
    source_id: r.source_id as string,
    source_title: r.source_title as string,
    content: r.content as string,
    rank: Number(r.rank),
  }));
}
