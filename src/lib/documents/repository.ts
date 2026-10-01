import type { SupabaseClient } from "@supabase/supabase-js";

// Area 08 — read queries backing the HR Document Centre UI. Every query
// here runs through the caller's normal RLS-scoped client (never the
// admin client), so an HR/admin user sees their org's documents via
// employee_documents_hr_full exactly as before; nothing here widens access
// beyond what RLS already allows.
export type DocumentListFilters = {
  employeeId?: string;
  documentTypeId?: string;
  lifecycleState?: string;
  sensitivity?: string;
  search?: string;
};

export async function listDocuments(supabase: SupabaseClient, filters: DocumentListFilters = {}) {
  let query = supabase
    .from("employee_documents")
    .select(
      "id, title, doc_type, lifecycle_state, sensitivity, visibility, issue_date, expiry_date, effective_date, legal_hold, archived_at, requires_acknowledgement, uploaded_at, employees(id, name, staff_no), document_types(id, name)"
    )
    .order("uploaded_at", { ascending: false })
    .limit(200);

  if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
  if (filters.documentTypeId) query = query.eq("document_type_id", filters.documentTypeId);
  if (filters.lifecycleState) query = query.eq("lifecycle_state", filters.lifecycleState);
  if (filters.sensitivity) query = query.eq("sensitivity", filters.sensitivity);
  if (filters.search) query = query.or(`title.ilike.%${filters.search}%,doc_type.ilike.%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDocumentCentreStats(supabase: SupabaseClient) {
  const states = ["draft", "review", "issued", "expired", "voided", "archived"];
  const counts: Record<string, number> = {};
  for (const state of states) {
    const { count } = await supabase
      .from("employee_documents")
      .select("id", { count: "exact", head: true })
      .eq("lifecycle_state", state);
    counts[state] = count ?? 0;
  }
  return counts;
}

export async function getDocumentDetail(supabase: SupabaseClient, documentId: string) {
  const { data: doc, error } = await supabase
    .from("employee_documents")
    .select(
      "id, title, doc_type, lifecycle_state, sensitivity, visibility, issue_date, expiry_date, effective_date, legal_hold, retention_until, archived_at, archived_by, requires_acknowledgement, current_version_id, owner_id, employee_id, employees(id, name, staff_no), document_types(id, name, requires_acknowledgement, acknowledgement_reset_on_new_version)"
    )
    .eq("id", documentId)
    .maybeSingle();
  if (error || !doc) throw new Error("Document not found.");

  const [{ data: versions }, { data: acknowledgements }, { data: shares }] = await Promise.all([
    supabase
      .from("document_versions")
      .select("id, version_number, status, file_name, file_size, uploaded_by, uploaded_at, issued_at, superseded_at, notes")
      .eq("document_id", documentId)
      .order("version_number", { ascending: false }),
    supabase
      .from("document_acknowledgements")
      .select("id, employee_id, version_id, status, viewed_at, acknowledged_at, declined_at, decline_reason, employees(name)")
      .eq("document_id", documentId),
    supabase
      .from("document_shares")
      .select("id, token, expires_at, revoked_at, max_views, view_count, created_at")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false }),
  ]);

  return { doc, versions: versions ?? [], acknowledgements: acknowledgements ?? [], shares: shares ?? [] };
}

export async function listExpiringDocuments(supabase: SupabaseClient, withinDays = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { data, error } = await supabase
    .from("employee_documents")
    .select("id, title, doc_type, expiry_date, lifecycle_state, employees(id, name, staff_no)")
    .in("lifecycle_state", ["issued", "acknowledged"])
    .not("expiry_date", "is", null)
    .lte("expiry_date", cutoff.toISOString().slice(0, 10))
    .order("expiry_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listArchivedDocuments(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("employee_documents")
    .select("id, title, doc_type, archived_at, employees(id, name, staff_no)")
    .eq("lifecycle_state", "archived")
    .order("archived_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDocumentTypesForOrg(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("document_types").select("*").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
