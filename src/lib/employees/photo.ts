// Validation + path convention for employee profile photos, mirroring the
// shape of lib/documents/upload.ts but scoped to the small, public
// employee-photos bucket (see migration 0121).

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB, matches the bucket's file_size_limit

export function validatePhoto(file: File): { ok: true; extension: string } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "Choose a photo to upload." };
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return { ok: false, error: `Photo is too large (max ${MAX_PHOTO_SIZE_BYTES / (1024 * 1024)}MB).` };
  }
  if (!file.type || !ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: "Photo must be a JPEG, PNG, or WEBP image." };
  }
  return { ok: true, extension: ALLOWED_EXTENSIONS[file.type] };
}

// Fixed filename per employee (not timestamped) so a re-upload overwrites
// the previous photo via upsert instead of accumulating orphaned files.
export function buildPhotoStoragePath(employeeId: string, extension: string): string {
  return `${employeeId}/photo.${extension}`;
}
