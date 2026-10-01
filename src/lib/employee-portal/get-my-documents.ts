import type { SupabaseClient } from "@supabase/supabase-js";

// Area 05 §9 "My Documents" — self-scoped list with lifecycle flags. Since
// Area 08, lifecycle comes from employee_documents.lifecycle_state (the
// governed workflow state) rather than being inferred purely from
// expiry_date/status at query time, though expiry/superseded fall back to
// the same date-vs-today check for any legacy row with no lifecycle_state
// signal. Acknowledgement state is now version-bound (migration 0080):
// looked up against the document's current_version_id, not just its id, so
// a newly-issued version with acknowledgement_reset_on_new_version correctly
// shows as pending again rather than carrying over the old version's
// acknowledged status. employee_documents_self_read RLS already restricts
// this to the caller's own documents.
export type MyDocumentRow = {
  id: string;
  fileName: string;
  docType: string;
  title: string | null;
  lifecycleState: string;
  issueDate: string | null;
  expiryDate: string | null;
  requiresAcknowledgement: boolean;
  currentVersionId: string | null;
  acknowledgementStatus: "pending" | "viewed" | "acknowledged" | "declined" | "expired" | null;
  acknowledgedAt: string | null;
  declineReason: string | null;
  lifecycle: "active" | "expiring" | "expired" | "archived" | "superseded";
};

export async function getMyDocuments(supabase: SupabaseClient, employeeId: string): Promise<MyDocumentRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: documents, error }, { data: acknowledgements }] = await Promise.all([
    supabase
      .from("employee_documents")
      .select(
        "id, file_name, doc_type, title, status, lifecycle_state, issue_date, expiry_date, requires_acknowledgement, current_version_id, archived_at, uploaded_at"
      )
      .eq("employee_id", employeeId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("document_acknowledgements")
      .select("document_id, version_id, status, acknowledged_at, declined_at, decline_reason")
      .eq("employee_id", employeeId),
  ]);
  if (error) throw new Error(error.message);

  const ackByDocAndVersion = new Map(
    (acknowledgements ?? []).map((a) => [`${a.document_id}:${a.version_id ?? "null"}`, a])
  );

  return (documents ?? []).map((d) => {
    let lifecycle: MyDocumentRow["lifecycle"] = "active";
    if (d.archived_at || d.lifecycle_state === "archived") lifecycle = "archived";
    else if (d.status === "Superseded" || d.lifecycle_state === "superseded") lifecycle = "superseded";
    else if (d.lifecycle_state === "expired" || (d.expiry_date && d.expiry_date < today)) lifecycle = "expired";
    else if (d.expiry_date && d.expiry_date <= in30Days) lifecycle = "expiring";

    const ack = ackByDocAndVersion.get(`${d.id}:${d.current_version_id ?? "null"}`);

    return {
      id: d.id,
      fileName: d.file_name,
      docType: d.doc_type,
      title: d.title,
      lifecycleState: d.lifecycle_state ?? "issued",
      issueDate: d.issue_date,
      expiryDate: d.expiry_date,
      requiresAcknowledgement: d.requires_acknowledgement,
      currentVersionId: d.current_version_id,
      acknowledgementStatus: (ack?.status as MyDocumentRow["acknowledgementStatus"]) ?? (d.requires_acknowledgement ? "pending" : null),
      acknowledgedAt: ack?.acknowledged_at ?? null,
      declineReason: ack?.decline_reason ?? null,
      lifecycle,
    };
  });
}
