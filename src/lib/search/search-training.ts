import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchResultItem } from "./search-types";

export async function searchTraining(supabase: SupabaseClient, query: string): Promise<SearchResultItem[]> {
  const { data } = await supabase.from("training_courses").select("id, name, mandatory").ilike("name", `%${query}%`).limit(6);

  return (data ?? []).map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.mandatory ? "Mandatory" : "Optional",
    href: `/dashboard/ld`,
  }));
}
