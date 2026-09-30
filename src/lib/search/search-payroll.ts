import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchResultItem } from "./search-types";

// RLS on payroll_runs is HR/admin-only, so an employee's search never
// returns a period here even though they can see their own payslips
// elsewhere — matches how the rest of the app scopes payroll.
export async function searchPayroll(supabase: SupabaseClient, query: string): Promise<SearchResultItem[]> {
  const { data } = await supabase
    .from("payroll_runs")
    .select("id, period, status")
    .ilike("period", `%${query}%`)
    .order("period", { ascending: false })
    .limit(6);

  return (data ?? []).map((r) => ({
    id: r.id,
    label: `${r.period} payroll`,
    sublabel: r.status,
    href: `/dashboard/payroll/${r.id}`,
  }));
}
