"use server";

// Area 08 §5 Lifecycle State Model + §19 Approval & Workflow Integration.
//
//   draft → review → approved/issued → acknowledged/superseded/expired/voided → archived
//   review → returned → draft (re-edit)
//   review → rejected → draft/voided
//
// A document_type with approval_required=true routes every new version
// through Area 02's generic approval engine (createApprovalRequest /
// decideApprovalStep — the same engine Attendance Correction and Employee
// Data Change already use) before it can become the current, issued
// version. A type with approval_required=false issues immediately on
// upload. Either way, lifecycle_state lives on employee_documents and is
// always kept separate from its legacy `status` (Active/Superseded) column
// and from employee employment status (spec §5).
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createApprovalRequest } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { createDocumentVersion } from "./versions";
import { writeDocumentEvent } from "./events";
import { requestAcknowledgement } from "./acknowledgement-engine";
import { assertNotUnderRetentionHold, computeRetentionUntil } from "./retention";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { processEventImmediately } from "@/lib/notifications/scheduler";
import type { DocumentTypeConfig } from "./types";

async function requireHrOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage document lifecycle.");
  return { userId: user.id, orgId: appUser.org_id as string };
}

async function getDocumentType(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentTypeId: string | null
): Promise<DocumentTypeConfig | null> {
  if (!documentTypeId) return null;
  const { data } = await supabase.from("document_types").select("*").eq("id", documentTypeId).maybeSingle();
  return (data as DocumentTypeConfig) ?? null;
}

// Schedules the configured warning thresholds for a document with an
// expiry_date — never hard-coded; always read from the type's
// expiry_warning_days_schedule (spec §20).
async function scheduleExpiryWarnings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string,
  schedule: number[]
) {
  if (!schedule?.length) return;
  const rows = schedule.map((days) => ({ document_id: documentId, warning_days: days }));
  await supabase.from("document_expiries").upsert(rows, { onConflict: "document_id,warning_days", ignoreDuplicates: true });
}

export async function createDocument(input: {
  employeeId: string;
  documentTypeId: string | null;
  docTypeLabel: string;
  title: string | null;
  visibility: "HR" | "Manager" | "Employee";
  sensitivity: string;
  file: File;
  issueDate?: string | null;
  expiryDate?: string | null;
  effectiveDate?: string | null;
  ownerId?: string | null;
}): Promise<{ documentId: string; versionId: string; lifecycleState: string }> {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);

  const docType = await getDocumentType(supabase, input.documentTypeId);
  const needsApproval = Boolean(docType?.approval_required);

  const { data: doc, error } = await supabase
    .from("employee_documents")
    .insert({
      employee_id: input.employeeId,
      doc_type: input.docTypeLabel,
      document_type_id: input.documentTypeId,
      title: input.title,
      visibility: input.visibility,
      sensitivity: input.sensitivity,
      file_path: "", // placeholder — replaced immediately below by the version's path reference
      file_name: input.file.name,
      uploaded_by: userId,
      issue_date: input.issueDate ?? null,
      expiry_date: input.expiryDate ?? null,
      effective_date: input.effectiveDate ?? null,
      owner_id: input.ownerId ?? input.employeeId,
      lifecycle_state: needsApproval ? "review" : "issued",
      requires_acknowledgement: docType?.requires_acknowledgement ?? false,
      retention_until: docType?.retention_period_months
        ? computeRetentionUntil(new Date(), docType.retention_period_months)
        : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { versionId, filePath } = await createDocumentVersion(supabase, {
    orgId,
    documentId: doc.id,
    employeeId: input.employeeId,
    file: input.file,
    uploadedBy: userId,
    status: needsApproval ? "review" : "issued",
  });

  // employee_documents.file_path is a legacy NOT NULL column that every
  // existing reader (HR Document Centre's original list, Employee 360,
  // search) still selects directly to mint a signed URL — keep it pointed
  // at this version's real storage object (not a synthetic token) so those
  // call sites keep resolving a working file until they're migrated onto
  // the version-aware access layer.
  await supabase.from("employee_documents").update({ file_path: filePath }).eq("id", doc.id);

  if (needsApproval) {
    const approvalRequestId = await createApprovalRequest(supabase, {
      orgId,
      requestType: "document_issue",
      entityType: "document_version",
      entityId: versionId,
      requestedBy: userId,
      subjectEmployeeId: input.employeeId,
      summary: `Issue document "${input.title ?? input.docTypeLabel}" for review`,
      impact: { documentId: doc.id, versionId, docType: input.docTypeLabel },
      steps: [{ approverRole: "hr" }],
    });
    await writeDocumentEvent(supabase, {
      orgId,
      documentId: doc.id,
      versionId,
      eventType: "document.submitted",
      actorId: userId,
      metadata: { approvalRequestId },
    });
  } else {
    if (docType?.requires_acknowledgement) {
      await requestAcknowledgement(supabase, { orgId, documentId: doc.id, employeeId: input.employeeId, versionId });
      const ackEventId = await emitNotificationEvent(supabase, {
        orgId,
        eventType: "document.acknowledgement.required",
        aggregateType: "employee_documents",
        aggregateId: doc.id as string,
        actorId: userId,
        idempotencyKey: `document.acknowledgement.required:${doc.id}:${versionId}`,
        payload: {
          documentId: doc.id,
          employeeId: input.employeeId,
          defaultTitle: "Document requires your acknowledgement",
          defaultMessage: `Please review and acknowledge: ${input.title ?? input.docTypeLabel}`,
          defaultActionUrl: "/dashboard/me/documents",
        },
      });
      if (ackEventId) {
        await processEventImmediately(createAdminClient(), ackEventId).catch((err) => console.error("processEventImmediately failed:", err));
      }
    }
    await scheduleExpiryWarnings(supabase, doc.id, docType?.expiry_warning_days_schedule ?? []);
  }

  revalidatePath("/dashboard/documents");
  return { documentId: doc.id as string, versionId, lifecycleState: needsApproval ? "review" : "issued" };
}


// Dispatched from the universal approvals inbox for request_type ===
// 'document_issue' — mirrors decideAttendanceCorrectionRequest's exact
// shape: the generic engine records the decision, this applies the
// document-specific effect once approved/rejected/returned.
export async function decideDocumentApproval(stepId: string, decision: "approved" | "rejected" | "returned") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const { data: stepRow } = await supabase
    .from("approval_steps")
    .select("approval_requests(entity_id, subject_employee_id)")
    .eq("id", stepId)
    .maybeSingle();
  const approvalRequestRow = stepRow?.approval_requests as unknown as {
    entity_id: string | null;
    subject_employee_id: string | null;
  } | null;
  const versionId = approvalRequestRow?.entity_id ?? null;
  if (!versionId) throw new Error("Document version not found for this approval.");

  const { requestId, requestStatus } = await decideApprovalStep(supabase, {
    stepId,
    orgId: appUser.org_id,
    decision,
    rbac: approvalRequestRow?.subject_employee_id
      ? { resource: "documents", action: "approve", sensitivity: "confidential", recordId: approvalRequestRow.subject_employee_id }
      : undefined,
  });

  // Multi-step requests (e.g. an administrator's, approved by HR then the CEO):
  // the change only takes effect once the FINAL step is approved.
  if (decision === "approved" && requestStatus !== "approved") {
    revalidatePath("/dashboard/approvals");
    return { requestId };
  }

  const { data: version } = await supabase
    .from("document_versions")
    .select("id, document_id, version_number, file_path")
    .eq("id", versionId)
    .single();
  if (!version) throw new Error("Document version not found.");

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id, employee_id, document_type_id, current_version_id, expiry_date, title, doc_type")
    .eq("id", version.document_id)
    .single();
  if (!doc) throw new Error("Document not found.");

  if (decision === "approved") {
    if (doc.current_version_id) {
      await supabase
        .from("document_versions")
        .update({ status: "superseded", superseded_at: new Date().toISOString() })
        .eq("id", doc.current_version_id);
    }
    await supabase
      .from("document_versions")
      .update({ status: "issued", issued_at: new Date().toISOString() })
      .eq("id", versionId);
    await supabase
      .from("employee_documents")
      .update({ current_version_id: versionId, lifecycle_state: "issued", file_path: version.file_path })
      .eq("id", doc.id);

    const docType = await getDocumentType(supabase, doc.document_type_id);
    if (docType?.requires_acknowledgement) {
      await requestAcknowledgement(supabase, {
        orgId: appUser.org_id,
        documentId: doc.id,
        employeeId: doc.employee_id,
        versionId,
      });
    }
    if (doc.expiry_date) {
      await scheduleExpiryWarnings(supabase, doc.id, docType?.expiry_warning_days_schedule ?? []);
    }

    await writeDocumentEvent(supabase, {
      orgId: appUser.org_id,
      documentId: doc.id,
      versionId,
      eventType: "document.issued",
      actorId: user.id,
    });

    const issuedEventId = await emitNotificationEvent(supabase, {
      orgId: appUser.org_id,
      eventType: "document.issued",
      aggregateType: "employee_documents",
      aggregateId: doc.id as string,
      actorId: user.id,
      idempotencyKey: `document.issued:${doc.id}:${versionId}`,
      payload: {
        documentId: doc.id,
        employeeId: doc.employee_id,
        defaultTitle: "A document has been issued",
        defaultMessage: `${doc.title ?? doc.doc_type} has been approved and issued.`,
        defaultActionUrl: "/dashboard/me/documents",
      },
    });
    if (issuedEventId) {
      await processEventImmediately(createAdminClient(), issuedEventId).catch((err) => console.error("processEventImmediately failed:", err));
    }
  } else {
    const newLifecycle = decision === "rejected" ? "rejected" : "returned";
    await supabase.from("document_versions").update({ status: newLifecycle }).eq("id", versionId);
    await supabase.from("employee_documents").update({ lifecycle_state: newLifecycle }).eq("id", doc.id);
    await writeDocumentEvent(supabase, {
      orgId: appUser.org_id,
      documentId: doc.id,
      versionId,
      eventType: decision === "rejected" ? "document.rejected" : "document.returned",
      actorId: user.id,
    });
  }

  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard/approvals");
  return { requestId };
}

export async function voidDocument(documentId: string, reason: string): Promise<void> {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);
  if (!reason.trim()) throw new Error("Explain why this document is being voided.");
  await assertNotUnderRetentionHold(supabase, documentId);

  const { error } = await supabase.from("employee_documents").update({ lifecycle_state: "voided" }).eq("id", documentId);
  if (error) throw new Error(error.message);

  await writeDocumentEvent(supabase, {
    orgId,
    documentId,
    eventType: "document.voided",
    actorId: userId,
    metadata: { reason },
  });

  revalidatePath("/dashboard/documents");
}

export async function archiveDocument(documentId: string): Promise<void> {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);
  await assertNotUnderRetentionHold(supabase, documentId);

  const { error } = await supabase
    .from("employee_documents")
    .update({ lifecycle_state: "archived", archived_at: new Date().toISOString(), archived_by: userId })
    .eq("id", documentId);
  if (error) throw new Error(error.message);

  await writeDocumentEvent(supabase, { orgId, documentId, eventType: "document.archived", actorId: userId });
  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard/documents/archive");
}

export async function restoreDocument(documentId: string): Promise<void> {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);

  const { data: doc } = await supabase.from("employee_documents").select("current_version_id").eq("id", documentId).maybeSingle();
  if (!doc) throw new Error("Document not found.");

  const { error } = await supabase
    .from("employee_documents")
    .update({ lifecycle_state: doc.current_version_id ? "issued" : "draft", archived_at: null, archived_by: null })
    .eq("id", documentId);
  if (error) throw new Error(error.message);

  await writeDocumentEvent(supabase, { orgId, documentId, eventType: "document.restored", actorId: userId });
  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard/documents/archive");
}
