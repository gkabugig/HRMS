import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchResultItem } from "./search-types";

export async function searchDocuments(supabase: SupabaseClient, query: string): Promise<SearchResultItem[]> {
  const [{ data: byType }, { data: byName }] = await Promise.all([
    supabase.from("employee_documents").select("id, doc_type, file_name, employee_id, employees(name)").ilike("doc_type", `%${query}%`).limit(6),
    supabase.from("employee_documents").select("id, doc_type, file_name, employee_id, employees(name)").ilike("file_name", `%${query}%`).limit(6),
  ]);

  const seen = new Set<string>();
  return [...(byType ?? []), ...(byName ?? [])]
    .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
    .slice(0, 6)
    .map((d) => {
      const emp = d.employees as unknown as { name: string } | null;
      return {
        id: d.id,
        label: d.file_name,
        sublabel: `${d.doc_type}${emp?.name ? ` · ${emp.name}` : ""}`,
        href: `/dashboard/employees/${d.employee_id}?tab=documents`,
      };
    });
}
