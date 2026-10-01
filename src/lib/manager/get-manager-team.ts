// Area 06 §6 "My Team" — the manager's authoritative team roster. "It must
// not be a search across the entire employee population" — scope comes
// from getManagerScope() (direct_reports by default), never a client query
// param, and every per-row widget below (attendance/leave/performance/
// learning status) is a single current/high-level signal, not a full
// Employee 360 fetch per row (spec §31: "Do not load Employee 360 data for
// every team member on initial page load").
import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamRosterRow = {
  id: string;
  name: string;
  staffNo: string;
  jobTitle: string;
  department: string;
  status: string;
  attendanceToday: "present" | "late" | "absent" | "on_leave" | "unknown";
  onLeave: boolean;
  pendingLeaveCount: number;
  learningOverdueCount: number;
};

export async function getManagerTeam(supabase: SupabaseClient, employeeIds: string[]): Promise<TeamRosterRow[]> {
  if (employeeIds.length === 0) return [];
  const today = new Date().toISOString().slice(0, 10);

  const employeesQuery = supabase
    .from("employees")
    .select("id, name, staff_no, job_title, department, status")
    .in("id", employeeIds)
    .order("name");
  const attendanceTodayQuery = supabase
    .from("attendance")
    .select("employee_id, clock_in, clock_out")
    .in("employee_id", employeeIds)
    .eq("work_date", today);
  const leaveTodayQuery = supabase
    .from("leave_requests")
    .select("employee_id")
    .in("employee_id", employeeIds)
    .eq("status", "Approved")
    .lte("start_date", today)
    .gte("end_date", today);
  const pendingLeaveQuery = supabase
    .from("leave_requests")
    .select("employee_id")
    .in("employee_id", employeeIds)
    .eq("status", "Pending");
  const enrollmentsQuery = supabase
    .from("training_enrollments")
    .select("employee_id, status, training_courses(name, mandatory)")
    .in("employee_id", employeeIds);
  const mandatoryCoursesQuery = supabase.from("training_courses").select("name").eq("mandatory", true);

  const [employeesRes, attendanceRes, leaveTodayRes, pendingLeaveRes, enrollmentsRes, mandatoryCoursesRes] = await Promise.all([
    employeesQuery,
    attendanceTodayQuery,
    leaveTodayQuery,
    pendingLeaveQuery,
    enrollmentsQuery,
    mandatoryCoursesQuery,
  ]);

  const onLeaveSet = new Set((leaveTodayRes.data ?? []).map((r) => r.employee_id));
  const attendanceByEmployee = new Map((attendanceRes.data ?? []).map((r) => [r.employee_id, r]));
  const pendingLeaveCounts = new Map<string, number>();
  for (const r of pendingLeaveRes.data ?? []) pendingLeaveCounts.set(r.employee_id, (pendingLeaveCounts.get(r.employee_id) ?? 0) + 1);

  const mandatoryNames = new Set((mandatoryCoursesRes.data ?? []).map((c) => c.name));
  const enrollmentRows = (enrollmentsRes.data ?? []) as unknown as {
    employee_id: string;
    status: string;
    training_courses: { name: string; mandatory: boolean } | null;
  }[];
  const completedByEmployee = new Map<string, Set<string>>();
  for (const e of enrollmentRows) {
    if (e.status !== "Completed" || !e.training_courses?.name) continue;
    if (!completedByEmployee.has(e.employee_id)) completedByEmployee.set(e.employee_id, new Set());
    completedByEmployee.get(e.employee_id)!.add(e.training_courses.name);
  }

  return (employeesRes.data ?? []).map((e) => {
    const onLeave = onLeaveSet.has(e.id);
    const record = attendanceByEmployee.get(e.id);
    let attendanceToday: TeamRosterRow["attendanceToday"] = "unknown";
    if (onLeave) attendanceToday = "on_leave";
    else if (record?.clock_in && record.clock_in > "08:15") attendanceToday = "late";
    else if (record?.clock_in) attendanceToday = "present";
    else if (e.status === "Active") attendanceToday = "absent";

    const completed = completedByEmployee.get(e.id) ?? new Set<string>();
    const learningOverdueCount = [...mandatoryNames].filter((name) => !completed.has(name)).length;

    return {
      id: e.id,
      name: e.name,
      staffNo: e.staff_no,
      jobTitle: e.job_title,
      department: e.department,
      status: e.status,
      attendanceToday,
      onLeave,
      pendingLeaveCount: pendingLeaveCounts.get(e.id) ?? 0,
      learningOverdueCount,
    };
  });
}
