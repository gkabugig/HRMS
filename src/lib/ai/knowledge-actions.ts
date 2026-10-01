"use server";

// Area 12 §9.7 "Approved source -> classification + metadata -> chunking/
// index". HR/admin pastes or uploads policy text; this chunks it by
// paragraph (simple, deterministic, good enough for the tsvector/pg_trgm
// retrieval this build uses - see rag.ts's header comment) and indexes it.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

async function requireHrOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage knowledge sources.");
  return { userId: user.id, orgId: appUser.org_id as string };
}

function chunkText(text: string, maxChars = 1200): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > maxChars && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export async function createKnowledgeSource(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);

  const title = String(formData.get("title") || "").trim();
  const sourceType = String(formData.get("source_type") || "policy_document");
  const classification = String(formData.get("classification") || "internal");
  const content = String(formData.get("content") || "").trim();
  if (!title) throw new Error("Title is required.");
  if (!content) throw new Error("Paste the document text to index.");

  const { data: source, error } = await supabase
    .from("ai_knowledge_sources")
    .insert({ org_id: orgId, source_type: sourceType, title, classification, created_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const chunks = chunkText(content);
  const rows = chunks.map((c, i) => ({ org_id: orgId, source_id: source.id, chunk_index: i, content: c }));
  if (rows.length > 0) {
    const { error: chunkError } = await supabase.from("ai_knowledge_chunks").insert(rows);
    if (chunkError) throw new Error(chunkError.message);
  }

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "ai_knowledge_sources.indexed",
    resourceType: "ai_knowledge_source",
    resourceId: source.id,
    eventCategory: "configuration",
    metadata: { chunk_count: rows.length },
  });

  revalidatePath("/dashboard/assistant/knowledge");
}

export async function setKnowledgeSourceActive(sourceId: string, isActive: boolean, _formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  await supabase.from("ai_knowledge_sources").update({ is_active: isActive }).eq("id", sourceId).eq("org_id", orgId);
  revalidatePath("/dashboard/assistant/knowledge");
}
