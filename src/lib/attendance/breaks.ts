import type { Db } from "@/lib/hub/context";

// Used by clock-out so a break is never left running after the shift ends.
export async function closeOpenBreaks(db: Db, employeeId: string) {
  await db.from("attendance_breaks").update({ ended_at: new Date().toISOString() }).eq("employee_id", employeeId).is("ended_at", null);
}
