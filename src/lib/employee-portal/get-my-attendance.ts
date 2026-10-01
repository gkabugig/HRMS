import type { SupabaseClient } from "@supabase/supabase-js";

// Area 05 §6 "My Attendance" — paginated self-scoped history (spec §24
// "paginate attendance, documents, requests and notifications"), plus the
// employee's own correction-request backlog (migration 0064). Never queries
// another employee's attendance — attendance_self_read RLS (0002) would
// block it anyway, but employeeId is still bound explicitly so a query
// against this function can never even be shaped to ask for someone else's.
export type MyAttendanceRow = { id: string; workDate: string; clockIn: string | null; clockOut: string | null };

export type MyAttendanceSummary = {
  monthLabel: string;
  present: number;
  late: number;
  recordedDays: number;
};

export type MyCorrectionRequest = {
  id: string;
  workDate: string;
  field: "clock_in" | "clock_out";
  requestedValue: string;
  reason: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
};

export async function getMyAttendanceHistory(
  supabase: SupabaseClient,
  employeeId: string,
  page = 0,
  pageSize = 20
): Promise<{ rows: MyAttendanceRow[]; total: number }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from("attendance")
    .select("id, work_date, clock_in, clock_out", { count: "exact" })
    .eq("employee_id", employeeId)
    .order("work_date", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []).map((r) => ({ id: r.id, workDate: r.work_date, clockIn: r.clock_in, clockOut: r.clock_out })),
    total: count ?? 0,
  };
}

export async function getMyAttendanceMonthSummary(supabase: SupabaseClient, employeeId: string): Promise<MyAttendanceSummary> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const { data } = await supabase
    .from("attendance")
    .select("work_date, clock_in")
    .eq("employee_id", employeeId)
    .gte("work_date", monthStart);

  const rows = data ?? [];
  const late = rows.filter((r) => r.clock_in && r.clock_in > "09:00:00").length;
  return {
    monthLabel: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    present: rows.length,
    late,
    recordedDays: rows.length,
  };
}

export async function getMyAttendanceCorrectionRequests(
  supabase: SupabaseClient,
  employeeId: string
): Promise<MyCorrectionRequest[]> {
  const { data, error } = await supabase
    .from("attendance_correction_requests")
    .select("id, work_date, field, requested_value, reason, status, created_at, decided_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    workDate: r.work_date,
    field: r.field,
    requestedValue: r.requested_value,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }));
}
