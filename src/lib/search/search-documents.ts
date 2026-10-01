import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchResultItem } from "./search-types";

// Area 08 §23 — this runs through the caller's own RLS-scoped client (never
// an admin client), so employee_documents_select_rbac/self_read/
// manager_visible/hr_full already govern exactly which rows come back —
// the same authorization layer every other document reader goes through,
// never bypassed here. Archived/voided/superseded rows are excluded for
// relevance, not for security.
const HIDDEN_LIFECYCLE_STATES = ["archived", "voided", "superseded"];

export async function searchDocuments(supabase: SupabaseClient, query: string): Promise<SearchResultItem[]> {
  const [{ data: byType }, { data: byName }] = await Promise.all([
    supabase
      .from("employee_documents")
      .select("id, doc_type, title, file_name, employee_id, lifecycle_state, employees(name)")
      .ilike("doc_type", `%${query}%`)
      .not("lifecycle_state", "in", `(${HIDDEN_LIFECYCLE_STATES.join(",")})`)
      .limit(6),
    supabase
      .from("employee_documents")
      .select("id, doc_type, title, file_name, employee_id, lifecycle_state, employees(name)")
      .ilike("file_name", `%${query}%`)
      .not("lifecycle_state", "in", `(${HIDDEN_LIFECYCLE_STATES.join(",")})`)
      .limit(6),
  ]);

  const seen = new Set<string>();
  return [...(byType ?? []), ...(byName ?? [])]
    .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
    .slice(0, 6)
    .map((d) => {
      const emp = d.employees as unknown as { name: string } | null;
      return {
        id: d.id,
        label: d.title || d.file_name,
        sublabel: `${d.doc_type}${emp?.name ? ` · ${emp.name}` : ""}`,
        href: `/dashboard/documents/${d.id}`,
      };
    });
}
