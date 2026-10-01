import type { SupabaseClient } from "@supabase/supabase-js";
import { getLeaveBalances } from "@/lib/leave/get-leave-balances";
import { getCurrentAssignment, type CurrentAssignment } from "@/lib/organisation/get-current-assignment";
import { getMyTasks, type MyTask } from "./get-my-tasks";
import { getNotifications } from "@/lib/notifications/actions";
import type { NotificationRow } from "@/lib/notifications/notification-types";

// Area 05 §4/§19 — the Employee Home / command centre aggregator.
// "Aggregate only self-scoped cards; parallelize bounded reads" (spec §17):
// every read below is scoped to one employeeId/userId and they all run in
// one Promise.all, rather than the page making N sequential round trips.
// Deliberately NOT built on getEmployee360 (src/lib/employees/get-employee-360.ts)
// even though that function already covers self-view leave/attendance/
// payroll/documents — it's shaped for the Employee 360 *profile* page (full
// job history, performance, learning, assets, activity feed, a manager-
// redaction branch that's dead weight for a pure self-view) and doesn't
// know about the Area 05-only concepts this needs (documents requiring
// acknowledgement, pending self-service requests, My Tasks). Home runs its
// own small, targeted queries instead — bounded exactly to what the command
// centre cards show, per spec §24's performance requirement.
export type DocumentAlert = {
  id: string;
  fileName: string;
  docType: string;
  reason: "expiring" | "expired" | "acknowledgement_required";
  expiryDate: string | null;
};

export type EmployeeHomeData = {
  employee: {
    id: string;
    name: string;
    staffNo: string;
    jobTitle: string;
    department: string;
    status: string;
  };
  orgContext: CurrentAssignment | null;
  today: {
    workDate: string;
    clockIn: string | null;
    clockOut: string | null;
  } | null;
  leave: {
    annualRemaining: number;
    pendingCount: number;
    nextApproved: { id: string; leaveType: string; startDate: string; endDate: string } | null;
  };
  pay: {
    latestPayslip: { period: string; net: number; publishedAt: string | null } | null;
  };
  documentAlerts: DocumentAlert[];
  pendingProfileChanges: number;
  pendingAttendanceCorrections: number;
  openRequests: number;
  notifications: { recent: NotificationRow[]; unreadCount: number };
  tasks: MyTask[];
};

export async function getEmployeeHome(
  supabase: SupabaseClient,
  params: { userId: string; employeeId: string; orgId: string; role: string }
): Promise<EmployeeHomeData> {
  const { userId, employeeId, orgId, role } = params;
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Split across a couple of Promise.all groups (rather than one long
  // heterogeneous tuple) — purely a TypeScript inference workaround: a
  // single very long Promise.all of mixed Supabase builder shapes collapses
  // to a lossy union type for every element. Still fully parallel within
  // each group.
  const employeeQuery = supabase.from("employees").select("id, name, staff_no, job_title, department, status").eq("id", employeeId).single();
  const attendanceTodayQuery = supabase
    .from("attendance")
    .select("work_date, clock_in, clock_out")
    .eq("employee_id", employeeId)
    .eq("work_date", today)
    .maybeSingle();
  const pendingLeaveQuery = supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("status", "Pending");
  const nextApprovedQuery = supabase
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date")
    .eq("employee_id", employeeId)
    .eq("status", "Approved")
    .gte("start_date", today)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [employeeRes, orgContext, attendanceTodayRes, leaveBalances, pendingLeaveRes, nextApprovedRes] = await Promise.all([
    employeeQuery,
    getCurrentAssignment(supabase, employeeId),
    attendanceTodayQuery,
    getLeaveBalances(supabase, orgId, [employeeId]),
    pendingLeaveQuery,
    nextApprovedQuery,
  ]);
  const employee = employeeRes.data;
  const attendanceToday = attendanceTodayRes.data;
  const pendingLeave = pendingLeaveRes.count;
  const nextApproved = nextApprovedRes.data;

  const [{ data: latestPayslip }, { data: documents }, { data: acknowledgements }] = await Promise.all([
    supabase
      .from("payslips")
      .select("gross, net, published_at, payroll_runs(period)")
      .eq("employee_id", employeeId)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("employee_documents")
      .select("id, file_name, doc_type, expiry_date, requires_acknowledgement, status, archived_at")
      .eq("employee_id", employeeId)
      .eq("status", "Active")
      .is("archived_at", null),
    supabase.from("document_acknowledgements").select("document_id").eq("employee_id", employeeId),
  ]);

  const [{ count: pendingProfileChanges }, { count: pendingAttendanceCorrections }, { count: openRequests }] = await Promise.all([
    supabase
      .from("profile_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("status", "Pending"),
    supabase
      .from("attendance_correction_requests")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .in("status", ["Submitted", "Under Review"]),
    supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .in("status", ["Submitted", "Triaged", "Assigned", "In Progress", "Waiting for Employee"]),
  ]);

  const [tasks, notifications] = await Promise.all([getMyTasks(supabase, userId, role), getNotifications()]);

  const acknowledgedIds = new Set((acknowledgements ?? []).map((a) => a.document_id as string));
  const documentAlerts: DocumentAlert[] = [];
  for (const doc of documents ?? []) {
    if (doc.requires_acknowledgement && !acknowledgedIds.has(doc.id)) {
      documentAlerts.push({ id: doc.id, fileName: doc.file_name, docType: doc.doc_type, reason: "acknowledgement_required", expiryDate: doc.expiry_date });
    }
    if (doc.expiry_date) {
      if (doc.expiry_date < today) {
        documentAlerts.push({ id: doc.id, fileName: doc.file_name, docType: doc.doc_type, reason: "expired", expiryDate: doc.expiry_date });
      } else if (doc.expiry_date <= in30Days) {
        documentAlerts.push({ id: doc.id, fileName: doc.file_name, docType: doc.doc_type, reason: "expiring", expiryDate: doc.expiry_date });
      }
    }
  }

  const annualRemaining = leaveBalances.reduce((sum, b) => sum + b.remaining, 0);
  const payslipRun = latestPayslip?.payroll_runs as unknown as { period: string } | null;

  return {
    employee: {
      id: employee?.id ?? employeeId,
      name: employee?.name ?? "",
      staffNo: employee?.staff_no ?? "",
      jobTitle: employee?.job_title ?? "",
      department: employee?.department ?? "",
      status: employee?.status ?? "",
    },
    orgContext,
    today: attendanceToday
      ? { workDate: attendanceToday.work_date, clockIn: attendanceToday.clock_in, clockOut: attendanceToday.clock_out }
      : null,
    leave: {
      annualRemaining,
      pendingCount: pendingLeave ?? 0,
      nextApproved: nextApproved
        ? { id: nextApproved.id, leaveType: nextApproved.leave_type, startDate: nextApproved.start_date, endDate: nextApproved.end_date }
        : null,
    },
    pay: {
      latestPayslip: latestPayslip ? { period: payslipRun?.period ?? "", net: latestPayslip.net, publishedAt: latestPayslip.published_at } : null,
    },
    documentAlerts,
    pendingProfileChanges: pendingProfileChanges ?? 0,
    pendingAttendanceCorrections: pendingAttendanceCorrections ?? 0,
    openRequests: openRequests ?? 0,
    notifications: { recent: notifications.notifications.slice(0, 5), unreadCount: notifications.unreadCount },
    tasks,
  };
}
