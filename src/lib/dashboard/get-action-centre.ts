// Action Centre (spec §6): "What should I do now?" Every alert here maps
// to real HRMS data and a real destination — no placeholder/demo items.
// RLS still scopes every query underneath (a manager only ever sees their
// own team's rows), on top of the activeEmployeeIds org-scoping the caller
// passes in. A few of the spec's listed alert types have no supporting
// column yet in this schema (payroll exceptions, appraisal due dates) —
// those are approximated from the closest real field or left out rather
// than invented; see comments below.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardContext, DashboardAlert } from "./dashboard-types";
import type { DashboardPermissions } from "./dashboard-permissions";

function daysUntil(dateStr: string, today: string): number {
  const ms = new Date(dateStr).getTime() - new Date(today).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export async function getActionCentre(
  supabase: SupabaseClient,
  context: DashboardContext,
  permissions: DashboardPermissions,
  activeEmployeeIds: string[]
): Promise<DashboardAlert[]> {
  const alerts: DashboardAlert[] = [];
  if (activeEmployeeIds.length === 0) return alerts;

  const in30Days = new Date(context.today);
  in30Days.setDate(in30Days.getDate() + 30);
  const in30DaysStr = in30Days.toISOString().slice(0, 10);

  const in14Days = new Date(context.today);
  in14Days.setDate(in14Days.getDate() + 14);
  const in14DaysStr = in14Days.toISOString().slice(0, 10);

  const [
    { data: expiringContracts },
    { data: pendingLeave },
    { data: probationEnding },
    { data: mandatoryCourses },
    { data: allEnrollments },
    { data: expiringCompliance },
    { data: openOffboarding },
    { data: staleAppraisals },
  ] = await Promise.all([
    supabase
      .from("employee_documents")
      .select("id, employee_id, expiry_date, employees(name)")
      .eq("doc_type", "Contract")
      .not("expiry_date", "is", null)
      .lte("expiry_date", in30DaysStr)
      .in("employee_id", activeEmployeeIds),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type, employees(name)")
      .eq("status", "Pending")
      .in("employee_id", activeEmployeeIds),
    supabase
      .from("employees")
      .select("id, name, probation_end_date")
      .not("probation_end_date", "is", null)
      .lte("probation_end_date", in14DaysStr)
      .in("id", activeEmployeeIds),
    permissions.canManageEmployees
      ? supabase.from("training_courses").select("id, name").eq("org_id", context.orgId).eq("mandatory", true)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    permissions.canManageEmployees
      ? supabase.from("training_enrollments").select("employee_id, course_id, status").in("employee_id", activeEmployeeIds)
      : Promise.resolve({ data: [] as { employee_id: string; course_id: string; status: string }[] }),
    permissions.canManageEmployees
      ? supabase
          .from("compliance_documents")
          .select("id, label, expiry_date, employee_id")
          .eq("org_id", context.orgId)
          .lte("expiry_date", in30DaysStr)
      : Promise.resolve({ data: [] as { id: string; label: string; expiry_date: string; employee_id: string | null }[] }),
    permissions.canManageEmployees
      ? supabase.from("offboarding_records").select("id, employee_id, status, employees(name)").eq("status", "In Progress")
      : Promise.resolve({ data: [] as { id: string; employee_id: string; status: string; employees: unknown }[] }),
    permissions.canManageEmployees
      ? supabase.from("appraisals").select("id, employee_id, cycle, status, created_at, employees(name)").eq("status", "In Progress")
      : Promise.resolve({ data: [] as { id: string; employee_id: string; cycle: string; status: string; created_at: string; employees: unknown }[] }),
  ]);

  // Contract expiring / expired
  for (const doc of expiringContracts ?? []) {
    const emp = doc.employees as unknown as { name: string } | null;
    const days = daysUntil(doc.expiry_date as string, context.today);
    alerts.push({
      id: `contract-${doc.id}`,
      severity: days < 0 ? "critical" : days <= 7 ? "critical" : "warning",
      category: "contracts",
      title: days < 0 ? `${emp?.name ?? "An employee"}'s contract has expired` : `${emp?.name ?? "An employee"}'s contract expires in ${days}d`,
      description: "Review and renew, or begin offboarding.",
      entityId: doc.employee_id as string,
      href: `/dashboard/employees/${doc.employee_id}?tab=documents`,
      actionLabel: "Review",
    });
  }

  // Leave approval pending
  for (const lr of pendingLeave ?? []) {
    const emp = lr.employees as unknown as { name: string } | null;
    alerts.push({
      id: `leave-${lr.id}`,
      severity: "warning",
      category: "leave",
      title: `${emp?.name ?? "An employee"}'s ${lr.leave_type} leave request is pending`,
      description: "Awaiting your approval or rejection.",
      entityId: lr.employee_id as string,
      href: `/dashboard/leave`,
      actionLabel: "Review request",
    });
  }

  // Probation ending
  for (const e of probationEnding ?? []) {
    const days = daysUntil(e.probation_end_date as string, context.today);
    alerts.push({
      id: `probation-${e.id}`,
      severity: days <= 3 ? "critical" : "warning",
      category: "probation",
      title: `${e.name}'s probation ends in ${days}d`,
      description: "Confirm, extend or end probation before it lapses.",
      entityId: e.id,
      href: `/dashboard/employees/${e.id}?tab=employment`,
      actionLabel: "Start review",
    });
  }

  // Training overdue: mandatory course with no completed enrollment for an active employee.
  if ((mandatoryCourses ?? []).length > 0) {
    const completedByEmployeeCourse = new Set(
      (allEnrollments ?? []).filter((en) => en.status === "Completed").map((en) => `${en.employee_id}:${en.course_id}`)
    );
    const enrolledByCourse = new Map<string, Set<string>>();
    for (const en of allEnrollments ?? []) {
      if (!enrolledByCourse.has(en.course_id)) enrolledByCourse.set(en.course_id, new Set());
      enrolledByCourse.get(en.course_id)!.add(en.employee_id);
    }
    for (const course of mandatoryCourses ?? []) {
      const enrolledIds = enrolledByCourse.get(course.id) ?? new Set<string>();
      const outstanding = [...enrolledIds].filter((empId) => !completedByEmployeeCourse.has(`${empId}:${course.id}`));
      if (outstanding.length > 0) {
        alerts.push({
          id: `training-${course.id}`,
          severity: "warning",
          category: "training",
          title: `${course.name} overdue for ${outstanding.length} employee${outstanding.length === 1 ? "" : "s"}`,
          description: "This course is mandatory and has not been completed.",
          href: `/dashboard/ld`,
          actionLabel: "Assign/complete",
        });
      }
    }
  }

  // Compliance document expiry (org-wide, may or may not have an employee_id).
  for (const doc of expiringCompliance ?? []) {
    const days = daysUntil(doc.expiry_date as string, context.today);
    alerts.push({
      id: `compliance-${doc.id}`,
      severity: days < 0 ? "critical" : "warning",
      category: "compliance",
      title: days < 0 ? `${doc.label} has expired` : `${doc.label} expires in ${days}d`,
      description: "Review compliance status before it lapses.",
      entityId: doc.employee_id ?? undefined,
      href: `/dashboard/compliance`,
      actionLabel: "Review compliance",
    });
  }

  // Offboarding pending
  for (const ob of openOffboarding ?? []) {
    const emp = ob.employees as unknown as { name: string } | null;
    alerts.push({
      id: `offboarding-${ob.id}`,
      severity: "warning",
      category: "offboarding",
      title: `${emp?.name ?? "An employee"}'s offboarding is still in progress`,
      description: "Clearance, assets or statutory deregistration outstanding.",
      entityId: ob.employee_id as string,
      href: `/dashboard/offboarding`,
      actionLabel: "Continue offboarding",
    });
  }

  // Appraisal overdue: proxy for "review due date passed" — this schema has
  // no due-date column on appraisals, so an in-progress cycle open for more
  // than 60 days is treated as stale.
  for (const a of staleAppraisals ?? []) {
    const daysOpen = Math.round((new Date(context.today).getTime() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (daysOpen >= 60) {
      const emp = a.employees as unknown as { name: string } | null;
      alerts.push({
        id: `appraisal-${a.id}`,
        severity: "warning",
        category: "performance",
        title: `${emp?.name ?? "An employee"}'s ${a.cycle} appraisal is still open`,
        description: `In progress for ${daysOpen} days.`,
        entityId: a.employee_id as string,
        href: `/dashboard/performance`,
        actionLabel: "Open appraisal",
      });
    }
  }

  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
