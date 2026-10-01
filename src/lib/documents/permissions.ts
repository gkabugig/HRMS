// Area 08 — thin, UI-facing permission helpers. The real enforcement is
// RLS + authorize()/user_can_access_document() everywhere a row is actually
// read or written (see access.ts, lifecycle.ts); these are only used to
// decide what the Document Centre UI shows (buttons, nav entries) — "UI
// hiding is not security" (spec §2), so nothing here is ever the only
// check standing between a user and a document.
export function canManageDocumentTypes(role: string): boolean {
  return role === "admin" || role === "hr";
}

export function canIssueDocuments(role: string): boolean {
  return role === "admin" || role === "hr";
}

export function canManageTemplates(role: string): boolean {
  return role === "admin" || role === "hr";
}

export function canManageRetention(role: string): boolean {
  return role === "admin" || role === "hr";
}
