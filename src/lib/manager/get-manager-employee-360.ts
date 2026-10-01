// Area 06 §7 "Team Employee 360 – Manager View" — a DELIBERATELY SEPARATE,
// narrower authorization projection from src/lib/employees/get-employee-
// 360.ts (the HR/admin view), per spec §7/§28: "Employee 360 manager view
// must be a separate authorization projection, not a full HR Employee 360
// dump." The HR version selects employees.* (bank/national-ID/statutory-ID/
// salary columns included), every employee_document regardless of
// visibility, the raw compliance_documents and employee_audit_log tables,
// and a disciplinary count — none of which belong in front of a manager by
// default (spec §19/§28). This function never selects those columns/tables
// at all, rather than fetching and redacting them in JS — the smaller the
// query, the smaller the risk of a future edit accidentally leaking a
// field through a shared component.
//
// Scope is NOT re-checked here beyond is_manager_of() via RLS — the caller
// (the route) must have already confirmed the target employeeId is within
// the acting manager's getManagerScope() result before calling this, and
// every query below additionally relies on the manager-team RLS policies
// (attendance/leave_requests/appraisals/training_enrollments/employee_documents/
// service_requests), which only return rows for employees is_manager_of()
// actually covers. Belt and suspenders: even a route bug that calls this
// for an out-of-scope employeeId gets an empty/redacted result, not a leak.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentManager } from "@/lib/organisation/get-current-manager";
import { getLeaveBalances } from "@/lib/leave/get-leave-balances";

export type ManagerEmployeeSummary = {
  id: string;
  name: string;
  staffNo: string;
  jobTitle: string;
  department: string;
  employmentType: string;
  dateOfHire: string;
  status: string;
};

export type ManagerEmployee360 = {
  employee: ManagerEmployeeSummary;
  managerId: string | null;
  startDate: string;
  attendance: {
    windowDays: number;
    daysPresent: number;
    lateDays: number;
    exceptions: { workDate: string; type: string }[];
  };
  leave: {
    balances: { leaveType: string; entitlement: number; used: number; pending: number; remaining: number }[];
    recent: { id: string; leaveType: string; startDate: string; endDate: string; status: string }[];
  };
  performance: {
    goals: { id: string; appraisalId: string; title: string; progress: string | null }[];
    appraisals: { id: string; cycle: string; status: string; finalScore: number | null }[];
    checkIns: { id: string; notes: string; agreedActions: string | null; createdAt: string }[];
  };
  learning: {
    enrollments: { id: string; status: string; courseName: string; enrolledOn: string; completedOn: string | null }[];
    overdueMandatory: { courseName: string }[];
  };
  documents: { id: string; docType: string; title: string | null; fileName: string; expiryDate: string | null }[];
  openRequests: { id: string; subject: string; status: string; createdAt: string }[];
};

export async function getManagerEmployee360(
  supabase: SupabaseClient,
  employeeId: string,
  orgId: string
): Promise<ManagerEmployee360> {
  const employeeQuery = supabase
    .from("employees")
    .select("id, name, staff_no, job_title, department, employment_type, date_of_hire, status")
    .eq("id", employeeId)
    .single();
  const attendanceQuery = supabase
    .from("attendance")
    .select("work_date, clock_in, clock_out")
    .eq("employee_id", employeeId)
    .order("work_date", { ascending: false })
    .limit(30);
  const leaveRecentQuery = supabase
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, status")
    .eq("employee_id", employeeId)
    .order("applied_on", { ascending: false })
    .limit(5);
  const appraisalsQuery = supabase
    .from("appraisals")
    .select("id, cycle, status, final_score")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(5);
  const checkInsQuery = supabase
    .from("manager_checkins")
    .select("id, notes, agreed_actions, created_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(10);
  const enrollmentsQuery = supabase
    .from("training_enrollments")
    .select("id, status, enrolled_on, completed_on, training_courses(name, mandatory)")
    .eq("employee_id", employeeId)
    .order("enrolled_on", { ascending: false });
  const mandatoryCoursesQuery = supabase.from("training_courses").select("id, name").eq("mandatory", true);
  // Visibility filter is defense-in-depth alongside the
  // employee_documents_manager_visible RLS policy (visibility='Manager' AND
  // is_manager_of) — belt and suspenders, not a substitute for it.
  const documentsQuery = supabase
    .from("employee_documents")
    .select("id, doc_type, title, file_name, expiry_date, lifecycle_state")
    .eq("employee_id", employeeId)
    .eq("visibility", "Manager")
    .eq("status", "Active")
    .in("lifecycle_state", ["issued", "acknowledged"])
    .is("archived_at", null);
  const requestsQuery = supabase
    .from("service_requests")
    .select("id, subject, status, created_at")
    .eq("employee_id", employeeId)
    .in("status", ["Submitted", "Triaged", "Assigned", "In Progress", "Waiting for Employee"]);

  const [
    employeeRes,
    managerId,
    attendanceRes,
    leaveBalances,
    leaveRecentRes,
    appraisalsRes,
    checkInsRes,
    enrollmentsRes,
    mandatoryCoursesRes,
    documentsRes,
    requestsRes,
  ] = await Promise.all([
    employeeQuery,
    getCurrentManager(supabase, employeeId),
    attendanceQuery,
    getLeaveBalances(supabase, orgId, [employeeId]).catch(() => []),
    leaveRecentQuery,
    appraisalsQuery,
    checkInsQuery,
    enrollmentsQuery,
    mandatoryCoursesQuery,
    documentsQuery,
    requestsQuery,
  ]);

  if (employeeRes.error || !employeeRes.data) throw new Error("Employee not found or not in your scope.");
  const employee = employeeRes.data;

  const attendanceRows = attendanceRes.data ?? [];
  const daysPresent = attendanceRows.filter((r) => r.clock_in).length;
  const lateDays = attendanceRows.filter((r) => r.clock_in && r.clock_in > "08:15").length;
  const exceptions = attendanceRows
    .filter((r) => !r.clock_in || (r.clock_in && !r.clock_out))
    .slice(0, 10)
    .map((r) => ({ workDate: r.work_date, type: !r.clock_in ? "absent" : "missing_clock_out" }));

  const enrollmentRows = (enrollmentsRes.data ?? []) as unknown as {
    id: string;
    status: string;
    enrolled_on: string;
    completed_on: string | null;
    training_courses: { name: string; mandatory: boolean } | null;
  }[];
  const completedCourseNames = new Set(enrollmentRows.filter((e) => e.status === "Completed").map((e) => e.training_courses?.name));
  const overdueMandatory = ((mandatoryCoursesRes.data ?? []) as { id: string; name: string }[])
    .filter((c) => !completedCourseNames.has(c.name))
    .map((c) => ({ courseName: c.name }));

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      staffNo: employee.staff_no,
      jobTitle: employee.job_title,
      department: employee.department,
      employmentType: employee.employment_type,
      dateOfHire: employee.date_of_hire,
      status: employee.status,
    },
    managerId,
    startDate: employee.date_of_hire,
    attendance: { windowDays: 30, daysPresent, lateDays, exceptions },
    leave: {
      balances: (leaveBalances ?? []).map((b) => ({
        leaveType: b.leaveType,
        entitlement: b.entitlement,
        used: b.used,
        pending: b.pending,
        remaining: b.remaining,
      })),
      recent: (leaveRecentRes.data ?? []).map((r) => ({
        id: r.id,
        leaveType: r.leave_type,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status,
      })),
    },
    performance: {
      // Area 06 §11 "Goals" — per spec, goals are per-appraisal; this
      // workspace shows them via the appraisal drill-in rather than a flat
      // list here (appraisal_goals has no standalone manager summary view
      // worth building separately from the appraisal it belongs to).
      goals: [],
      appraisals: (appraisalsRes.data ?? []).map((a) => ({
        id: a.id,
        cycle: a.cycle,
        status: a.status,
        finalScore: a.final_score,
      })),
      checkIns: (checkInsRes.data ?? []).map((c) => ({
        id: c.id,
        notes: c.notes,
        agreedActions: c.agreed_actions,
        createdAt: c.created_at,
      })),
    },
    learning: {
      enrollments: enrollmentRows.map((e) => ({
        id: e.id,
        status: e.status,
        courseName: e.training_courses?.name ?? "—",
        enrolledOn: e.enrolled_on,
        completedOn: e.completed_on,
      })),
      overdueMandatory,
    },
    documents: (documentsRes.data ?? []).map((d) => ({ id: d.id, docType: d.doc_type, title: d.title, fileName: d.file_name, expiryDate: d.expiry_date })),
    openRequests: (requestsRes.data ?? []).map((r) => ({
      id: r.id,
      subject: r.subject,
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}
