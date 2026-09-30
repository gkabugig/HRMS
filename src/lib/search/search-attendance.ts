import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchResultItem } from "./search-types";

// "Missing clock-outs" / "late" style queries → route straight to the
// Attendance Command Centre's exceptions panel rather than trying to
// enumerate individual rows (exceptions are computed, not stored).
export async function searchAttendance(supabase: SupabaseClient, query: string): Promise<SearchResultItem[]> {
  const q = query.toLowerCase();
  const results: SearchResultItem[] = [];

  if ("missing clock-out".includes(q) || "missing clock out".includes(q) || q.includes("clock")) {
    results.push({
      id: "attendance-missing-clockout",
      label: "Missing clock-outs",
      sublabel: "Attendance exceptions",
      href: "/dashboard/attendance#exceptions",
    });
  }
  if ("late arrivals".includes(q) || q.includes("late")) {
    results.push({
      id: "attendance-late",
      label: "Late arrivals",
      sublabel: "Attendance exceptions",
      href: "/dashboard/attendance#exceptions",
    });
  }
  if ("overtime".includes(q) || q.includes("overtime")) {
    results.push({
      id: "attendance-overtime",
      label: "Overtime",
      sublabel: "Attendance exceptions",
      href: "/dashboard/attendance#exceptions",
    });
  }
  if ("absent".includes(q) || q.includes("absent")) {
    results.push({
      id: "attendance-absent",
      label: "Absences",
      sublabel: "Attendance exceptions",
      href: "/dashboard/attendance#exceptions",
    });
  }

  if (results.length === 0) {
    const { data } = await supabase
      .from("employees")
      .select("id, name")
      .ilike("name", `%${query}%`)
      .limit(3);
    for (const e of data ?? []) {
      results.push({
        id: `attendance-${e.id}`,
        label: `${e.name}'s attendance`,
        sublabel: "Attendance history",
        href: `/dashboard/attendance#team`,
      });
    }
  }

  return results.slice(0, 6);
}
