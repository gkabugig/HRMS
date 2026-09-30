import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchResultItem } from "./search-types";

export async function searchLeave(supabase: SupabaseClient, query: string): Promise<SearchResultItem[]> {
  const q = query.toLowerCase();
  // "pending leave" style queries match the status word; anything else
  // matches the leave type. RLS scopes the rows (self/team/org) exactly as
  // the Leave page itself does.
  const statusMatch = ["pending", "approved", "rejected"].find((s) => s.includes(q) || q.includes(s));

  const { data } = await supabase
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, status, employees(name)")
    .order("applied_on", { ascending: false })
    .limit(30);

  return (data ?? [])
    .filter((r) => {
      const type = (r.leave_type as string).toLowerCase();
      const status = (r.status as string).toLowerCase();
      return type.includes(q) || (statusMatch && status === statusMatch);
    })
    .slice(0, 6)
    .map((r) => {
      const emp = r.employees as unknown as { name: string } | null;
      return {
        id: r.id,
        label: `${emp?.name ?? "Leave request"} — ${r.leave_type}`,
        sublabel: `${r.status} · ${r.start_date} → ${r.end_date}`,
        href: `/dashboard/leave?view=requests`,
      };
    });
}
