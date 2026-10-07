import type { SupabaseClient } from "@supabase/supabase-js";

export const CV_BUCKET = "candidate-cvs";
export const MAX_CV_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["pdf", "doc", "docx"];

// Pure check so the rules are tested: a CV is optional, but if present it must
// be a small PDF/Word file.
export function validateCv(file: { name: string; size: number } | null | undefined): string | null {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.includes(ext)) return "The CV must be a PDF or Word file (.pdf, .doc, .docx).";
  if (file.size > MAX_CV_BYTES) return "The CV is too large. Please keep it under 5 MB.";
  return null;
}

export function safeFileName(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "");
  return base.slice(-80) || "cv";
}

// Uploads with the service-role client (callers check permission first, or
// are the public apply form) and returns the stored path.
export async function storeCv(admin: SupabaseClient, requisitionId: string, candidateId: string, file: File): Promise<string> {
  const path = `${requisitionId}/${candidateId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await admin.storage.from(CV_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error("Couldn't upload the CV. Please try again.");
  return path;
}
