// Area 08: Document Lifecycle Management — shared types.
//
// lifecycle_state lives on employee_documents (migration 0079) and is kept
// deliberately separate from the legacy `status` column (Active/Superseded,
// a storage-availability flag) and from employee employment status, per
// spec §5. version status lives on document_versions and tracks where one
// specific upload is in its own approval/issue path.

export type DocumentLifecycleState =
  | "draft"
  | "review"
  | "approved"
  | "issued"
  | "acknowledged"
  | "returned"
  | "rejected"
  | "superseded"
  | "expired"
  | "voided"
  | "archived";

export type DocumentVersionStatus =
  | "draft"
  | "review"
  | "approved"
  | "issued"
  | "rejected"
  | "returned"
  | "superseded"
  | "voided";

export type DocumentAcknowledgementStatus = "pending" | "viewed" | "acknowledged" | "declined" | "expired";

export type DocumentSensitivity = "Public" | "Internal" | "Confidential" | "Highly Restricted";

export const DOCUMENT_SENSITIVITIES: DocumentSensitivity[] = ["Public", "Internal", "Confidential", "Highly Restricted"];

export type DocumentEventType =
  | "document.created"
  | "document.uploaded"
  | "document.versioned"
  | "document.submitted"
  | "document.approved"
  | "document.issued"
  | "document.returned"
  | "document.rejected"
  | "document.viewed"
  | "document.downloaded"
  | "document.acknowledgement_requested"
  | "document.acknowledgement_completed"
  | "document.acknowledgement_declined"
  | "document.shared"
  | "document.share_revoked"
  | "document.expiry_warning"
  | "document.expired"
  | "document.superseded"
  | "document.renewed"
  | "document.voided"
  | "document.archived"
  | "document.restored"
  | "document.retention_changed"
  | "document.access_permission_changed"
  | "document.generated";

export type DocumentTypeConfig = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  default_sensitivity: DocumentSensitivity;
  requires_acknowledgement: boolean;
  acknowledgement_reset_on_new_version: boolean;
  approval_required: boolean;
  expiry_warning_days_schedule: number[];
  retention_period_months: number | null;
  is_active: boolean;
};
