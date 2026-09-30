import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchResultItem } from "./search-types";

// RLS on `employees` already scopes this to the signed-in user's
// permitted rows (HR/admin: org; manager: team; employee: self) — the
// same table, same policies, the Employees list page itself reads. Search
// never needs its own permission logic here.
export async function searchEmployees(supabase: SupabaseClient, query: string): Promise<SearchResultItem[]> {
  const [{ data: byName }, { data: byStaffNo }] = await Promise.all([
    supabase.from("employees").select("id, name, staff_no, department, job_title").ilike("name", `%${query}%`).limit(6),
    supabase.from("employees").select("id, name, staff_no, department, job_title").ilike("staff_no", `%${query}%`).limit(6),
  ]);

  const seen = new Set<string>();
  return [...(byName ?? []), ...(byStaffNo ?? [])]
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      label: e.name,
      sublabel: `${e.staff_no} · ${e.department} · ${e.job_title}`,
      href: `/dashboard/employees/${e.id}`,
    }));
}
