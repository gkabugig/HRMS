import type { SupabaseClient } from "@supabase/supabase-js";
import { validateUpload, buildDocumentStoragePath } from "./upload";
import { writeDocumentEvent } from "./events";
import type { DocumentVersionStatus } from "./types";

// Area 08 §10 Version Control. An issued version is never overwritten —
// every upload against an existing document creates a new row here, and
// the previous current version (if any) is flipped to 'superseded'. The
// non-negotiable rule (spec §2) this exists to satisfy: "never overwrite an
// issued version; always create a new version."
export async function getNextVersionNumber(supabase: SupabaseClient, documentId: string): Promise<number> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.version_number ?? 0) + 1;
}

export async function createDocumentVersion(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    documentId: string;
    employeeId: string;
    file: File;
    uploadedBy: string;
    status?: DocumentVersionStatus;
    notes?: string | null;
  }
): Promise<{ versionId: string; versionNumber: number; filePath: string }> {
  const validation = validateUpload(input.file);
  if (!validation.ok) throw new Error(validation.error);

  const versionNumber = await getNextVersionNumber(supabase, input.documentId);
  const filePath = buildDocumentStoragePath({
    employeeId: input.employeeId,
    documentId: input.documentId,
    versionNumber,
    fileName: input.file.name,
  });

  const { error: uploadError } = await supabase.storage
    .from("employee-documents")
    .upload(filePath, input.file, { contentType: input.file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const status: DocumentVersionStatus = input.status ?? "issued";
  const { data: version, error } = await supabase
    .from("document_versions")
    .insert({
      document_id: input.documentId,
      version_number: versionNumber,
      status,
      file_path: filePath,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      file_size: input.file.size,
      uploaded_by: input.uploadedBy,
      issued_at: status === "issued" ? new Date().toISOString() : null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // Roll back the storage object if the metadata row couldn't be
    // created — never leave an orphaned private file with no record.
    await supabase.storage.from("employee-documents").remove([filePath]);
    throw new Error(error.message);
  }

  // Mark the previously-current version superseded if this new one is
  // taking over as the current, issued version.
  if (status === "issued") {
    const { data: doc } = await supabase
      .from("employee_documents")
      .select("current_version_id")
      .eq("id", input.documentId)
      .maybeSingle();
    if (doc?.current_version_id) {
      await supabase
        .from("document_versions")
        .update({ status: "superseded", superseded_at: new Date().toISOString() })
        .eq("id", doc.current_version_id);
    }
    await supabase
      .from("employee_documents")
      .update({ current_version_id: version.id, lifecycle_state: "issued", file_path: filePath, file_name: input.file.name })
      .eq("id", input.documentId);
  }

  await writeDocumentEvent(supabase, {
    orgId: input.orgId,
    documentId: input.documentId,
    versionId: version.id,
    eventType: versionNumber === 1 ? "document.created" : "document.versioned",
    actorId: input.uploadedBy,
    metadata: { versionNumber, fileName: input.file.name, status },
  });

  return { versionId: version.id as string, versionNumber, filePath };
}

export async function listDocumentVersions(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from("document_versions")
    .select("id, version_number, status, file_name, mime_type, file_size, uploaded_by, uploaded_at, issued_at, superseded_at, notes")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
