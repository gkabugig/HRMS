import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchResultItem } from "./search-types";

export async function searchRecruitment(supabase: SupabaseClient, query: string): Promise<SearchResultItem[]> {
  const { data } = await supabase
    .from("requisitions")
    .select("id, role, department, status")
    .ilike("role", `%${query}%`)
    .limit(6);

  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.role,
    sublabel: `${r.department} · ${r.status}`,
    href: `/dashboard/recruitment`,
  }));
}
