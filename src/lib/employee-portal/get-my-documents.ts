import type { SupabaseClient } from "@supabase/supabase-js";

// Area 05 §9 "My Documents" — self-scoped list with lifecycle flags computed
// at query time (expiry_date vs today — see migration 0064's note on why
// Expiring/Expired aren't separate stored status values) plus acknowledgement
// state (document_acknowledgements, migration 0064). employee_documents_self_read
// RLS already restricts this to the caller's own documents.
export type MyDocumentRow = {
  id: string;
  fileName: string;
  docType: string;
  status: string;
  issueDate: string | null;
  expiryDate: string | null;
  requiresAcknowledgement: boolean;
  acknowledgedAt: string | null;
  lifecycle: "active" | "expiring" | "expired" | "archived" | "superseded";
};

export async function getMyDocuments(supabase: SupabaseClient, employeeId: string): Promise<MyDocumentRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: documents, error }, { data: acknowledgements }] = await Promise.all([
    supabase
      .from("employee_documents")
      .select("id, file_name, doc_type, status, issue_date, expiry_date, requires_acknowledgement, archived_at, uploaded_at")
      .eq("employee_id", employeeId)
      .order("uploaded_at", { ascending: false }),
    supabase.from("document_acknowledgements").select("document_id, acknowledged_at").eq("employee_id", employeeId),
  ]);
  if (error) throw new Error(error.message);

  const ackByDoc = new Map((acknowledgements ?? []).map((a) => [a.document_id as string, a.acknowledged_at as string]));

  return (documents ?? []).map((d) => {
    let lifecycle: MyDocumentRow["lifecycle"] = "active";
    if (d.archived_at) lifecycle = "archived";
    else if (d.status === "Superseded") lifecycle = "superseded";
    else if (d.expiry_date && d.expiry_date < today) lifecycle = "expired";
    else if (d.expiry_date && d.expiry_date <= in30Days) lifecycle = "expiring";

    return {
      id: d.id,
      fileName: d.file_name,
      docType: d.doc_type,
      status: d.status,
      issueDate: d.issue_date,
      expiryDate: d.expiry_date,
      requiresAcknowledgement: d.requires_acknowledgement,
      acknowledgedAt: ackByDoc.get(d.id) ?? null,
      lifecycle,
    };
  });
}
