import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaveRequestRow } from "./leave-types";

// Fetches only the visible date range (spec §34 performance requirement),
// not the whole leave history. RLS already scopes the rows to what this
// view is allowed to see — self for "My Leave", team for a manager,
// unrestricted (within admin/hr's full-table policy) for "Company".
export async function getLeaveCalendar(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<LeaveRequestRow[]> {
  const { data } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type, start_date, end_date, days, reason, status, applied_on, decided_on, employees(name, department, reporting_manager_id)")
    .in("status", ["Approved", "Pending"])
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date");

  return (data ?? []) as unknown as LeaveRequestRow[];
}
