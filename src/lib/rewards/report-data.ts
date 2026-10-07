import { mergePolicy, type Db } from "./context";
import type { CaseRow, PoolRow, RepRow, ReportInput, TxRow } from "./report-engine";

export type ReportFilters = { cycle?: string; department?: string; grade?: string; manager?: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadReportInput(db: Db, orgId: string, f: ReportFilters): Promise<{ input: ReportInput; options: { cycles: { id: string; name: string }[]; departments: string[]; grades: string[]; managers: string[] } }> {
  let rq = db.from("reward_recommendations").select("id, cycle_id, employee_id, reward_type, status, calculated_amount, recommended_amount, pct, is_exception, justification, scheme_id, pool_id, snapshot").eq("org_id", orgId);
  if (f.cycle) rq = rq.eq("cycle_id", f.cycle);
  const [{ data: recs }, { data: cycles }, { data: schemes }, { data: pools }, { data: cases }, { data: pol }] = await Promise.all([
    rq,
    db.from("reward_cycles").select("id, name").eq("org_id", orgId).order("created_at", { ascending: false }),
    db.from("reward_schemes").select("id, name").eq("org_id", orgId),
    (f.cycle ? db.from("reward_pools").select("id, name, pool_type, approved_budget").eq("org_id", orgId).eq("cycle_id", f.cycle) : db.from("reward_pools").select("id, name, pool_type, approved_budget").eq("org_id", orgId)),
    db.from("promotion_cases").select("assessment, current_title, proposed_title, status, readiness_score, readiness_label").eq("org_id", orgId).order("created_at", { ascending: false }),
    db.from("reward_policies").select("config").eq("org_id", orgId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const ids = [...new Set((recs ?? []).map((r: any) => r.employee_id as string))];
  const { data: emps } = ids.length ? await db.from("employees").select("id, name, department, reporting_manager_id").in("id", ids) : { data: [] as any[] };
  const empMap = new Map((emps ?? []).map((e: any) => [e.id as string, e]));
  const mgrIds = [...new Set((emps ?? []).map((e: any) => e.reporting_manager_id).filter(Boolean))] as string[];
  const { data: mgrs } = mgrIds.length ? await db.from("employees").select("id, name").in("id", mgrIds) : { data: [] as any[] };
  const mgrName = new Map((mgrs ?? []).map((m: any) => [m.id as string, m.name as string]));
  const schemeName = new Map((schemes ?? []).map((s: any) => [s.id as string, s.name as string]));

  const all: RepRow[] = (recs ?? []).map((r: any) => {
    const e: any = empMap.get(r.employee_id) ?? {};
    const s = r.snapshot ?? {};
    return {
      recId: r.id,
      cycleId: r.cycle_id,
      employeeId: r.employee_id,
      name: e.name ?? s.employeeName ?? "Employee",
      department: e.department ?? s.department ?? "—",
      managerName: e.reporting_manager_id ? mgrName.get(e.reporting_manager_id) ?? "Unknown manager" : "No manager",
      grade: s.grade ?? "No grade",
      rating: s.rating ?? null,
      type: r.reward_type,
      status: r.status,
      calculated: Number(r.calculated_amount),
      recommended: Number(r.recommended_amount),
      pct: r.pct === null ? null : Number(r.pct),
      isException: !!r.is_exception,
      justification: r.justification,
      schemeName: r.scheme_id ? schemeName.get(r.scheme_id) ?? null : null,
      poolId: r.pool_id,
      excluded: s.eligibility?.result === "excluded" || s.rating == null,
    };
  });
  const options = {
    cycles: (cycles ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    departments: [...new Set(all.map((r) => r.department))].sort(),
    grades: [...new Set(all.map((r) => r.grade))].sort(),
    managers: [...new Set(all.map((r) => r.managerName))].sort(),
  };
  const rows = all.filter((r) => (!f.department || r.department === f.department) && (!f.grade || r.grade === f.grade) && (!f.manager || r.managerName === f.manager));

  const rowById = new Map(rows.map((r) => [r.recId, r]));
  const recIds = rows.map((r) => r.recId);
  const { data: txRows } = recIds.length ? await db.from("reward_transactions").select("recommendation_id, tx_type, amount, effective_date, payroll_status").in("recommendation_id", recIds) : { data: [] as any[] };
  const txs: TxRow[] = (txRows ?? []).map((t: any) => {
    const r = rowById.get(t.recommendation_id)!;
    return { employeeId: r.employeeId, name: r.name, department: r.department, type: t.tx_type, amount: Number(t.amount), effective: t.effective_date, status: t.payroll_status };
  });
  const poolRows: PoolRow[] = (pools ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.pool_type, budget: Number(p.approved_budget) }));
  const caseRows: CaseRow[] = (cases ?? []).map((c: any) => ({ name: c.assessment?.employeeName ?? "Employee", from: c.current_title ?? "—", to: c.proposed_title, status: c.status, readiness: c.readiness_score === null ? null : Number(c.readiness_score), label: c.readiness_label }));
  const ratingOrder = [...mergePolicy(pol?.config).bands].sort((a, b) => b.min - a.min).map((b) => b.rating);
  return { input: { rows, txs, pools: poolRows, cases: caseRows, ratingOrder }, options };
}
