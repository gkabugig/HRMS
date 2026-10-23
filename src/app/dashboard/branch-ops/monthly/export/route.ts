import type { NextRequest } from "next/server";
import { getCtx, type Db } from "@/lib/hub/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { loadMonth } from "@/lib/branch-ops/monthly";
import { csvResponse } from "@/lib/reports";

// Stops a name like "=HYPERLINK(...)" running as a formula in Excel.
const cell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export async function GET(request: NextRequest) {
  let c;
  try {
    c = await getCtx();
  } catch {
    return new Response("Not signed in.", { status: 401 });
  }
  if (!["admin", "hr"].includes(c.role)) return new Response("Not allowed.", { status: 403 });
  const today = nairobiNow().date;
  const m = request.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= today.slice(0, 7) ? m : today.slice(0, 7);
  const rows = await loadMonth(createAdminClient() as Db, c.orgId, month, today);
  return csvResponse(
    `attendance-${month}.csv`,
    rows.map((r) => ({
      "Staff no": cell(r.staffNo),
      Name: cell(r.name),
      Branch: cell(r.branch),
      "Days worked": r.daysWorked,
      "Late days": r.lateDays,
      "Minutes late": r.minutesLate,
      "Absent days": r.absentDays,
      "Leave days": r.leaveDays,
      "Rest days": r.restDays,
      "Missing clock-outs": r.missingClockOuts,
      "Hours worked (net of breaks)": r.hoursWorked,
      "Overtime hours": r.overtimeHours,
    }))
  );
}
