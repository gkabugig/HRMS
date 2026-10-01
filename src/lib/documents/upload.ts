// Area 08 §11 Secure Upload Pipeline — validation + path generation, steps
// 4-5 of the 9-step pipeline ("validate MIME/extension/size" and "sanitize
// filename + server-generate path"). The org and storage path are always
// resolved server-side here, never accepted from the client.

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "xls", "xlsx"]);

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export function validateUpload(file: File): { ok: true } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: `File is too large (max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB).` };
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `File type ".${ext}" is not allowed.` };
  }
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: `File content type "${file.type}" is not allowed.` };
  }
  return { ok: true };
}

export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(-200);
  // Strip path separators and anything but safe filename characters —
  // closes off path traversal regardless of what the client sends.
  return trimmed.replace(/[\\/]/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
}

// Storage path convention: {employee_id}/{document_id}/{version_number}-{timestamp}-{safe_filename}
// — keeps every version of every document in its own addressable location
// inside the existing private `employee-documents` bucket (per inspection,
// the bucket's storage policies key off the first path segment being the
// owning employee's id — that invariant is preserved here).
export function buildDocumentStoragePath(params: {
  employeeId: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
}): string {
  const safeName = sanitizeFilename(params.fileName);
  return `${params.employeeId}/${params.documentId}/${params.versionNumber}-${Date.now()}-${safeName}`;
}
