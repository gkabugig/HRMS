// Employee 360 aggregator (see Employee 360 build spec, §10). One place
// that fans out to every table the profile needs, in parallel, so the page
// component itself doesn't contain a dozen unrelated queries. RLS still
// governs every one of these underneath — this just shapes what comes back
// and additionally redacts payroll figures in the JS layer for a manager
// viewer, per the spec's "Manager: Limited/No salary" rule (defense in
// depth on top of, not instead of, the database policies).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/auth/roles";
import { buildEmployeeAlerts, type EmployeeAlert } from "./alerts";

export type Viewer = { role: UserRole; employeeId: string | null };

export type EmployeeRow = Record<string, unknown> & {
  id: string;
  name: string;
  staff_no: string;
  department: string;
  job_title: string;
  employment_type: string;
  date_of_hire: string;
  status: string;
  probation_end_date: string | null;
  contract_issued_on: string | null;
  basic: number;
  house_allowance: number;
  transport_allowance: number;
  other_allowance: number;
  reporting_manager_id: string | null;
};

export type ManagerSummary = {
  id: string;
  name: string;
  staff_no: string;
  job_title: string;
  department: string;
} | null;

export type LeaveSummary = {
  annualEntitlement: number;
  annualUsed: number;
  annualRemaining: number;
  pendingCount: number;
  recent: { id: string; leave_type: string; start_date: string; end_date: string; days: number; status: string }[];
};

export type AttendanceSummary = {
  windowDays: number;
  recordedDays: number;
  daysPresent: number;
  lateDays: number;
  attendancePct: number | null;
  recent: { id: string; work_date: string; clock_in: string | null; clock_out: string | null }[];
};

export type PayrollSummary = {
  visible: boolean;
  currentGross: number | null;
  latestPayslip: { period: string; gross: number; net: number; paye: number } | null;
  compensationHistory: {
    id: string;
    effective_from: string;
    effective_to: string | null;
    basic: number;
    house_allowance: number;
    transport_allowance: number;
    other_allowance: number;
    reason: string | null;
  }[];
};

export type PerformanceSummary = {
  latest: { id: string; cycle: string; status: string; final_score: number | null } | null;
  recent: { id: string; cycle: string; status: string; final_score: number | null }[];
};

export type LearningSummary = {
  enrollments: { id: string; status: string; course_name: string; enrolled_on: string; completed_on: string | null }[];
  overdueMandatory: { id: string; courseName: string }[];
};

export type ComplianceSummary = {
  documents: { id: string; label: string; doc_type: string; expiry_date: string }[];
  disciplinaryCount: number;
};

export type DocumentSummary = {
  id: string;
  document_type: string;
  title: string;
  file_path: string;
  issue_date: string | null;
  expiry_date: string | null;
  visibility: string;
  uploaded_at: string;
  url: string | null;
};

export type AssetSummary = {
  id: string;
  asset_type: string;
  asset_tag: string | null;
  serial_no: string | null;
  issued_on: string;
  returned_on: string | null;
  status: string;
};

export type ContactSummary = {
  id: string;
  contact_type: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
};

export type JobHistoryRow = {
  id: string;
  effective_from: string;
  effective_to: string | null;
  department: string;
  job_title: string;
  employment_type: string;
  reason: string | null;
};

export type NoteSummary = {
  id: string;
  note_type: string;
  note: string;
  visibility: string;
  created_at: string;
};

export type ActivityItem = {
  id: string;
  at: string;
  title: string;
  description?: string;
};

export type Employee360 = {
  employee: EmployeeRow;
  manager: ManagerSummary;
  leave: LeaveSummary;
  attendance: AttendanceSummary;
  payroll: PayrollSummary;
  performance: PerformanceSummary;
  learning: LearningSummary;
  compliance: ComplianceSummary;
  documents: DocumentSummary[];
  assets: AssetSummary[];
  contacts: ContactSummary[];
  jobHistory: JobHistoryRow[];
  notes: NoteSummary[];
  activity: ActivityItem[];
  alerts: EmployeeAlert[];
};

const DEFAULT_ANNUAL_ENTITLEMENT = 21;

function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEmployee360(supabase: SupabaseClient<any>, employeeId: string, viewer: Viewer): Promise<Employee360> {
  const { data: employee, error } = await supabase
    .from("employees")
    .select(
      "*, manager:reporting_manager_id(id, name, staff_no, job_title, department), branches(name)"
    )
    .eq("id", employeeId)
    .single();

  if (error || !employee) throw new Error("Employee not found");

  const canViewPayroll = viewer.role === "admin" || viewer.role === "hr" || viewer.employeeId === employeeId;

  const [
    { data: leavePolicy },
    { data: leaveRequests },
    { count: pendingLeaveCount },
    { data: attendanceRows },
    { data: payslipRows },
    { data: compHistory },
    { data: appraisals },
    { data: enrollments },
    { data: mandatoryCourses },
    { data: complianceDocs },
    { count: disciplinaryCount },
    { data: documents },
    { data: assets },
    { data: contacts },
    { data: jobHistory },
    { data: notes },
    { data: auditLog },
  ] = await Promise.all([
    supabase.from("leave_policies").select("annual_entitlement_days").eq("leave_type", "Annual").maybeSingle(),
    supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, days, status, applied_on")
      .eq("employee_id", employeeId)
      .order("applied_on", { ascending: false })
      .limit(5),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).eq("status", "Pending"),
    supabase
      .from("attendance")
      .select("id, work_date, clock_in, clock_out")
      .eq("employee_id", employeeId)
      .order("work_date", { ascending: false })
      .limit(90),
    supabase
      .from("payslips")
      .select("gross, net, paye, payroll_runs(period)")
      .eq("employee_id", employeeId)
      .order("id", { ascending: false })
      .limit(1),
    supabase
      .from("employee_compensation_history")
      .select("id, effective_from, effective_to, basic, house_allowance, transport_allowance, other_allowance, reason")
      .eq("employee_id", employeeId)
      .order("effective_from", { ascending: false }),
    supabase
      .from("appraisals")
      .select("id, cycle, status, final_score, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("training_enrollments")
      .select("id, status, enrolled_on, completed_on, training_courses(name, mandatory)")
      .eq("employee_id", employeeId)
      .order("enrolled_on", { ascending: false }),
    supabase.from("training_courses").select("id, name").eq("mandatory", true),
    supabase
      .from("compliance_documents")
      .select("id, doc_type, label, expiry_date")
      .eq("employee_id", employeeId)
      .order("expiry_date"),
    supabase.from("disciplinary_actions").select("id", { count: "exact", head: true }).eq("employee_id", employeeId),
    supabase
      .from("employee_documents")
      .select("id, doc_type, file_path, file_name, issue_date, expiry_date, visibility, uploaded_at")
      .eq("employee_id", employeeId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("employee_assets")
      .select("id, asset_type, asset_tag, serial_no, issued_on, returned_on, status")
      .eq("employee_id", employeeId)
      .order("issued_on", { ascending: false }),
    supabase
      .from("employee_contacts")
      .select("id, contact_type, name, relationship, phone, email, is_primary")
      .eq("employee_id", employeeId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("employee_job_history")
      .select("id, effective_from, effective_to, department, job_title, employment_type, reason")
      .eq("employee_id", employeeId)
      .order("effective_from", { ascending: false }),
    supabase
      .from("employee_notes")
      .select("id, note_type, note, visibility, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
    supabase
      .from("employee_audit_log")
      .select("id, changed_at, field, old_value, new_value")
      .eq("employee_id", employeeId)
      .order("changed_at", { ascending: false })
      .limit(10),
  ]);

  // ---- Leave ----
  const annualEntitlement = leavePolicy?.annual_entitlement_days ?? DEFAULT_ANNUAL_ENTITLEMENT;
  const { data: approvedThisYear } = await supabase
    .from("leave_requests")
    .select("days")
    .eq("employee_id", employeeId)
    .eq("leave_type", "Annual")
    .eq("status", "Approved")
    .gte("start_date", yearStart());
  const annualUsed = (approvedThisYear ?? []).reduce((sum: number, r: { days: number }) => sum + r.days, 0);

  const leave: LeaveSummary = {
    annualEntitlement,
    annualUsed,
    annualRemaining: Math.max(0, annualEntitlement - annualUsed),
    pendingCount: pendingLeaveCount ?? 0,
    recent: (leaveRequests ?? []) as LeaveSummary["recent"],
  };

  // ---- Attendance (90-day window) ----
  const rows = (attendanceRows ?? []) as { id: string; work_date: string; clock_in: string | null; clock_out: string | null }[];
  const daysPresent = rows.filter((r) => r.clock_in).length;
  const lateDays = rows.filter((r) => r.clock_in && r.clock_in > "08:15").length;
  const attendance: AttendanceSummary = {
    windowDays: 90,
    recordedDays: rows.length,
    daysPresent,
    lateDays,
    attendancePct: rows.length > 0 ? Math.round((daysPresent / rows.length) * 1000) / 10 : null,
    recent: rows.slice(0, 10),
  };

  // ---- Payroll (redacted unless permitted) ----
  const latestSlip = (payslipRows ?? [])[0] as unknown as
    | { gross: number; net: number; paye: number; payroll_runs: { period: string } | null }
    | undefined;
  const currentGross =
    Number(employee.basic || 0) +
    Number(employee.house_allowance || 0) +
    Number(employee.transport_allowance || 0) +
    Number(employee.other_allowance || 0);
  const payroll: PayrollSummary = {
    visible: canViewPayroll,
    currentGross: canViewPayroll ? currentGross : null,
    latestPayslip:
      canViewPayroll && latestSlip
        ? { period: latestSlip.payroll_runs?.period ?? "—", gross: latestSlip.gross, net: latestSlip.net, paye: latestSlip.paye }
        : null,
    compensationHistory: canViewPayroll ? ((compHistory ?? []) as PayrollSummary["compensationHistory"]) : [],
  };

  // ---- Performance ----
  const performance: PerformanceSummary = {
    latest: (appraisals ?? [])[0] ?? null,
    recent: (appraisals ?? []) as PerformanceSummary["recent"],
  };
  const performanceReviewOverdue = !(appraisals ?? []).some((a: { status: string }) => a.status === "Completed");

  // ---- Learning ----
  const enrollmentRows = (enrollments ?? []) as unknown as {
    id: string;
    status: string;
    enrolled_on: string;
    completed_on: string | null;
    training_courses: { name: string; mandatory: boolean } | null;
  }[];
  const completedCourseNames = new Set(
    enrollmentRows.filter((e) => e.status === "Completed").map((e) => e.training_courses?.name)
  );
  const overdueMandatory = ((mandatoryCourses ?? []) as { id: string; name: string }[])
    .filter((c) => !completedCourseNames.has(c.name))
    .map((c) => ({ id: c.id, courseName: c.name }));
  const learning: LearningSummary = {
    enrollments: enrollmentRows.map((e) => ({
      id: e.id,
      status: e.status,
      course_name: e.training_courses?.name ?? "—",
      enrolled_on: e.enrolled_on,
      completed_on: e.completed_on,
    })),
    overdueMandatory,
  };

  // ---- Compliance ----
  const compliance: ComplianceSummary = {
    documents: (complianceDocs ?? []) as ComplianceSummary["documents"],
    disciplinaryCount: disciplinaryCount ?? 0,
  };

  // ---- Documents (with signed URLs from the private bucket) ----
  const docRows = (documents ?? []) as {
    id: string;
    doc_type: string;
    file_path: string;
    file_name: string;
    issue_date: string | null;
    expiry_date: string | null;
    visibility: string;
    uploaded_at: string;
  }[];
  const documentSummaries: DocumentSummary[] = [];
  for (const d of docRows) {
    const { data: signed } = await supabase.storage.from("employee-documents").createSignedUrl(d.file_path, 3600);
    documentSummaries.push({
      id: d.id,
      document_type: d.doc_type,
      title: d.file_name,
      file_path: d.file_path,
      issue_date: d.issue_date,
      expiry_date: d.expiry_date,
      visibility: d.visibility,
      uploaded_at: d.uploaded_at,
      url: signed?.signedUrl ?? null,
    });
  }

  const contactSummaries = (contacts ?? []) as ContactSummary[];
  const assetSummaries = (assets ?? []) as AssetSummary[];
  const jobHistoryRows = (jobHistory ?? []) as JobHistoryRow[];
  const noteSummaries = (notes ?? []) as NoteSummary[];

  // ---- Activity: audit log entries, most recent first ----
  const activity: ActivityItem[] = ((auditLog ?? []) as { id: string; changed_at: string; field: string; old_value: string | null; new_value: string | null }[]).map(
    (a) => ({
      id: a.id,
      at: a.changed_at,
      title: `${a.field.replace(/_/g, " ")} changed`,
      description: a.old_value || a.new_value ? `${a.old_value ?? "—"} → ${a.new_value ?? "—"}` : undefined,
    })
  );

  const expiringDocuments = documentSummaries
    .filter((d) => d.expiry_date)
    .map((d) => ({ id: d.id, title: d.title, expiryDate: d.expiry_date as string }));
  for (const cd of compliance.documents) {
    expiringDocuments.push({ id: `compliance-${cd.id}`, title: cd.label, expiryDate: cd.expiry_date });
  }

  const alerts = buildEmployeeAlerts({
    employeeId,
    contractIssuedOn: employee.contract_issued_on,
    probationEndDate: employee.probation_end_date,
    expiringDocuments,
    overdueTraining: overdueMandatory,
    pendingLeaveCount: leave.pendingCount,
    missingRequiredDocs: [],
    performanceReviewOverdue,
    noWrittenContract: !employee.contract_issued_on,
  });

  return {
    employee: employee as EmployeeRow,
    manager: (employee.manager as ManagerSummary) ?? null,
    leave,
    attendance,
    payroll,
    performance,
    learning,
    compliance,
    documents: documentSummaries,
    assets: assetSummaries,
    contacts: contactSummaries,
    jobHistory: jobHistoryRows,
    notes: noteSummaries,
    activity,
    alerts,
  };
}
