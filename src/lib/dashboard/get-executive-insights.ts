// Extra organisation-wide insights for the head of organisation (CEO) view.
// Runs with the privileged client the aggregator hands over, after the
// caller has verified the signed-in user IS the head of the organisation.
// Every query is filtered by org_id.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutiveInsights } from "./dashboard-types";

const REQUEST_LABEL: Record<string, string> = {
  leave: "Leave",
  position_request: "Position",
  workforce_plan: "Workforce plan",
  attendance_correction: "Attendance",
  profile_change: "Profile change",
  compensation_change: "Compensation",
  document: "Document",
  document_lifecycle: "Document",
};

function label(type: string): string {
  return REQUEST_LABEL[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export async function getExecutiveInsights(db: SupabaseClient, orgId: string): Promise<ExecutiveInsights> {
  const [approvals, positions, runs, discipline, findings, leave] = await Promise.all([
    db.from("approval_requests").select("request_type, created_at").eq("org_id", orgId).eq("status", "pending_approval"),
    db.from("positions").select("headcount_approved, status").eq("org_id", orgId),
    db.from("payroll_runs").select("id, period").eq("org_id", orgId).order("period", { ascending: false }).limit(6),
    db.from("disciplinary_actions").select("id, employees!inner(org_id)", { count: "exact", head: true }).is("outcome", null).eq("employees.org_id", orgId),
    db.from("ai_insights").select("severity").eq("org_id", orgId).eq("status", "open").eq("category", "org_structure"),
    db.from("leave_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "Pending"),
  ]);

  // Pending approvals by type + the oldest waiting item.
  const byType = new Map<string, number>();
  let oldest: string | null = null;
  for (const r of approvals.data ?? []) {
    const k = label(r.request_type as string);
    byType.set(k, (byType.get(k) ?? 0) + 1);
    if (!oldest || (r.created_at as string) < oldest) oldest = r.created_at as string;
  }
  const oldestDays = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000) : null;

  // Establishment: approved seats vs. occupied positions.
  let approvedSeats = 0;
  let vacantSeats = 0;
  for (const p of positions.data ?? []) {
    const seats = Number(p.headcount_approved ?? 1);
    approvedSeats += seats;
    if (p.status === "vacant") vacantSeats += seats;
  }

  // Payroll cost, last six runs, oldest first.
  const runList = [...(runs.data ?? [])].reverse();
  let payrollTrend: { label: string; value: number }[] = [];
  if (runList.length > 0) {
    const { data: slips } = await db
      .from("payslips")
      .select("payroll_run_id, gross")
      .in("payroll_run_id", runList.map((r) => r.id));
    const totals = new Map<string, number>();
    for (const s of slips ?? []) totals.set(s.payroll_run_id as string, (totals.get(s.payroll_run_id as string) ?? 0) + Number(s.gross ?? 0));
    payrollTrend = runList.map((r) => ({ label: r.period as string, value: Math.round(totals.get(r.id as string) ?? 0) }));
  }

  const sev = { high: 0, attention: 0, info: 0 };
  for (const f of findings.data ?? []) {
    const s = (f.severity as string) in sev ? (f.severity as keyof typeof sev) : "info";
    sev[s] += 1;
  }

  // Rewards (null until the module has been set up).
  let rewards: ExecutiveInsights["rewards"] = null;
  try {
    const [pools, recs, cases] = await Promise.all([
      db.from("reward_pool_status").select("approved_budget, committed").eq("org_id", orgId),
      db.from("reward_recommendations").select("status, recommended_amount").eq("org_id", orgId),
      db.from("promotion_cases").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "In Review"),
    ]);
    if (!pools.error && !recs.error) {
      const p = pools.data ?? [];
      const r = recs.data ?? [];
      rewards = {
        approvedToDate: r.filter((x) => ["Finalised", "Paid"].includes(x.status as string)).reduce((a, x) => a + Number(x.recommended_amount), 0),
        budgetTotal: p.reduce((a, x) => a + Number(x.approved_budget), 0),
        committedTotal: p.reduce((a, x) => a + Number(x.committed), 0),
        recommendationsInReview: r.filter((x) => x.status === "In Review").length,
        promotionsInReview: cases.count ?? 0,
        poolsNearLimit: p.filter((x) => Number(x.approved_budget) > 0 && Number(x.committed) / Number(x.approved_budget) >= 0.9).length,
      };
    }
  } catch {
    rewards = null;
  }

  return {
    pendingApprovalsByType: [...byType.entries()].map(([l, value]) => ({ label: l, value })).sort((a, b) => b.value - a.value),
    pendingApprovalsTotal: approvals.data?.length ?? 0,
    oldestApprovalDays: oldestDays,
    establishment: { approvedSeats, vacantSeats, filledSeats: Math.max(approvedSeats - vacantSeats, 0) },
    payrollTrend,
    openDisciplinaryCases: discipline.count ?? 0,
    pendingLeaveRequests: leave.count ?? 0,
    dataQuality: { high: sev.high, attention: sev.attention, info: sev.info, total: sev.high + sev.attention + sev.info },
    rewards,
  };
}
