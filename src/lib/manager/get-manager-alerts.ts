// Area 06 §15 "Manager Alerts" — a worklist of things needing manager
// attention, built ONLY from neutral, actionable signals (approval overdue,
// attendance correction awaiting action, upcoming approved leave, overdue
// mandatory learning, appraisal/check-in due, document expiring, service
// request needing input, requisition action pending). Per spec §15/§28 this
// must never use judgmental labels ("bad performer", "flight risk",
// "problem employee") or infer anything beyond what the underlying records
// already say — every alert here maps 1:1 to a row in a system the manager
// already has access to via the other manager/* functions.
//
// Takes the already-fetched team slices as input rather than re-querying,
// since get-manager-home fetches all of them in parallel anyway — this
// avoids duplicating six queries just to re-derive alerts from the same
// data.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamAttendanceData } from "./get-team-attendance";
import type { TeamLeaveData } from "./get-team-leave";
import type { TeamLearningData } from "./get-team-learning";
import type { TeamPerformanceData } from "./get-team-performance";
import type { ManagerServiceRequest } from "./get-manager-requests";
import type { ManagerRecruitmentData } from "./get-manager-recruitment";

export type ManagerAlert = {
  id: string;
  category:
    | "approval_overdue"
    | "attendance_correction"
    | "leave_upcoming"
    | "learning_overdue"
    | "appraisal_due"
    | "document_expiring"
    | "service_request"
    | "requisition_pending";
  employeeId: string | null;
  employeeName: string | null;
  message: string;
  dueAt: string | null;
};

export async function getManagerAlerts(
  supabase: SupabaseClient,
  employeeIds: string[],
  slices: {
    attendance: TeamAttendanceData;
    leave: TeamLeaveData;
    learning: TeamLearningData;
    performance: TeamPerformanceData;
    requests: ManagerServiceRequest[];
    recruitment: ManagerRecruitmentData;
  }
): Promise<ManagerAlert[]> {
  const alerts: ManagerAlert[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Approval steps pending and overdue, assigned to this manager (RLS already
  // restricts to approver_user_id = auth.uid()).
  const { data: overdueSteps } = await supabase
    .from("approval_steps")
    .select("id, due_at, approval_requests(id, summary, subject_employee_id)")
    .eq("status", "pending")
    .lt("due_at", today);

  const employeeNameById = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: employees } = await supabase.from("employees").select("id, name").in("id", employeeIds);
    for (const e of employees ?? []) employeeNameById.set(e.id, e.name);
  }

  for (const s of overdueSteps ?? []) {
    const req = (Array.isArray(s.approval_requests) ? s.approval_requests[0] : s.approval_requests) as {
      id: string;
      summary: string;
      subject_employee_id: string | null;
    } | null;
    if (!req) continue;
    alerts.push({
      id: `approval_overdue:${s.id}`,
      category: "approval_overdue",
      employeeId: req.subject_employee_id,
      employeeName: req.subject_employee_id ? employeeNameById.get(req.subject_employee_id) ?? null : null,
      message: `Approval overdue: ${req.summary}`,
      dueAt: s.due_at,
    });
  }

  for (const c of slices.attendance.pendingCorrections) {
    alerts.push({
      id: `attendance_correction:${c.stepId}`,
      category: "attendance_correction",
      employeeId: null,
      employeeName: null,
      message: `Attendance correction awaiting your decision: ${c.summary}`,
      dueAt: c.dueAt,
    });
  }

  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const l of slices.leave.upcoming) {
    if (l.start_date > in7Days) continue;
    alerts.push({
      id: `leave_upcoming:${l.id}`,
      category: "leave_upcoming",
      employeeId: l.employee_id,
      employeeName: employeeNameById.get(l.employee_id) ?? null,
      message: `Approved leave starting ${l.start_date}`,
      dueAt: l.start_date,
    });
  }

  const overdueCountByEmployee = new Map<string, number>();
  for (const o of slices.learning.overdueByEmployee) {
    overdueCountByEmployee.set(o.employeeId, (overdueCountByEmployee.get(o.employeeId) ?? 0) + 1);
  }
  for (const [employeeId, count] of overdueCountByEmployee) {
    alerts.push({
      id: `learning_overdue:${employeeId}`,
      category: "learning_overdue",
      employeeId,
      employeeName: employeeNameById.get(employeeId) ?? null,
      message: `${count} mandatory course${count === 1 ? "" : "s"} overdue`,
      dueAt: null,
    });
  }

  for (const a of slices.performance.overdueAppraisals) {
    alerts.push({
      id: `appraisal_due:${a.employeeId}:${a.cycle}`,
      category: "appraisal_due",
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      message: `Appraisal not yet completed: ${a.cycle}`,
      dueAt: null,
    });
  }

  if (employeeIds.length > 0) {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: expiring } = await supabase
      .from("employee_documents")
      .select("id, employee_id, doc_type, expiry_date")
      .in("employee_id", employeeIds)
      .eq("visibility", "Manager")
      .eq("status", "Active")
      .is("archived_at", null)
      .not("expiry_date", "is", null)
      .lte("expiry_date", in30Days)
      .gte("expiry_date", today);
    for (const d of expiring ?? []) {
      alerts.push({
        id: `document_expiring:${d.id}`,
        category: "document_expiring",
        employeeId: d.employee_id,
        employeeName: employeeNameById.get(d.employee_id) ?? null,
        message: `${d.doc_type} expiring ${d.expiry_date}`,
        dueAt: d.expiry_date,
      });
    }
  }

  for (const r of slices.requests) {
    if (r.status !== "Waiting for Employee" && r.status !== "Submitted") continue;
    if (r.status === "Submitted") {
      alerts.push({
        id: `service_request:${r.id}`,
        category: "service_request",
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        message: `Service request needs input: ${r.subject}`,
        dueAt: r.slaDueAt,
      });
    }
  }

  for (const req of slices.recruitment.requisitions) {
    if (req.status !== "Open") continue;
    const needsAction = req.candidates.some((c) => c.stage === "Offered");
    if (needsAction) {
      alerts.push({
        id: `requisition_pending:${req.id}`,
        category: "requisition_pending",
        employeeId: null,
        employeeName: null,
        message: `Requisition "${req.role}" has an offer awaiting action`,
        dueAt: null,
      });
    }
  }

  return alerts;
}
