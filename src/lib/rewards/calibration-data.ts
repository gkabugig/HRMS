import type { Db } from "./context";
import type { CalRow, Person } from "./calibration-engine";
import { serviceBand } from "./calibration-engine";
import { completedMonths } from "./engine";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadCalRows(db: Db, orgId: string, cycleId: string): Promise<CalRow[]> {
  const { data: recs } = await db
    .from("reward_recommendations")
    .select("id, employee_id, reward_type, calculated_amount, recommended_amount, pct, snapshot, status")
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId)
    .in("reward_type", ["merit", "bonus"]);
  const ids = [...new Set((recs ?? []).map((r) => r.employee_id as string))];
  const { data: emps } = ids.length ? await db.from("employees").select("id, name, department, reporting_manager_id").in("id", ids) : { data: [] as any[] };
  const empMap = new Map((emps ?? []).map((e: any) => [e.id as string, e]));
  const mgrIds = [...new Set((emps ?? []).map((e: any) => e.reporting_manager_id).filter(Boolean))] as string[];
  const { data: mgrs } = mgrIds.length ? await db.from("employees").select("id, name").in("id", mgrIds) : { data: [] as any[] };
  const mgrName = new Map((mgrs ?? []).map((m: any) => [m.id as string, m.name as string]));

  return (recs ?? []).map((r: any) => {
    const e: any = empMap.get(r.employee_id) ?? {};
    const s = (r.snapshot ?? {}) as any;
    const cell = s.merit?.cell;
    return {
      recId: r.id,
      employeeId: r.employee_id,
      name: e.name ?? s.employeeName ?? "Employee",
      department: e.department ?? s.department ?? "—",
      managerId: e.reporting_manager_id ?? null,
      managerName: e.reporting_manager_id ? mgrName.get(e.reporting_manager_id) ?? "Unknown manager" : "No manager",
      rewardType: r.reward_type,
      rating: s.rating ?? null,
      pct: r.pct === null || r.pct === undefined ? null : Number(r.pct),
      meritMin: cell ? Number(cell.min) : null,
      meritMax: cell ? Number(cell.max) : null,
      calculated: Number(r.calculated_amount),
      recommended: Number(r.recommended_amount),
      bonusCapped: !!s.bonus?.capped,
      bonusOverCap: s.bonus?.cap != null && Number(r.recommended_amount) > Number(s.bonus.cap) + 0.005,
      missingEvidence: (s.eligibility?.missingEvidence?.length ?? 0) > 0,
      excluded: s.eligibility?.result === "excluded" || s.rating == null,
    } satisfies CalRow;
  });
}

export async function loadPeople(db: Db, orgId: string, cycle: { id: string; period_start: string; period_end: string; effective_date: string }): Promise<Person[]> {
  const rows = await loadCalRows(db, orgId, cycle.id);
  const ids = [...new Set(rows.map((r) => r.employeeId))];
  if (ids.length === 0) return [];
  const [{ data: emps }, { data: cases }, { data: recs }] = await Promise.all([
    db.from("employees").select("id, gender, date_of_hire").in("id", ids),
    db.from("promotion_cases").select("employee_id").eq("org_id", orgId).in("status", ["Approved", "Finalised"]).gte("effective_date", cycle.period_start).lte("effective_date", cycle.effective_date),
    db.from("reward_recommendations").select("employee_id, snapshot").eq("cycle_id", cycle.id).eq("reward_type", "merit"),
  ]);
  const emp = new Map((emps ?? []).map((e: any) => [e.id as string, e]));
  const promoted = new Set((cases ?? []).map((c: any) => c.employee_id as string));
  const grade = new Map((recs ?? []).map((r: any) => [r.employee_id as string, (r.snapshot?.grade as string | null) ?? "No grade"]));
  const out: Person[] = [];
  for (const id of ids) {
    const mr = rows.find((r) => r.employeeId === id && r.rewardType === "merit");
    const br = rows.find((r) => r.employeeId === id && r.rewardType === "bonus");
    const base = mr ?? br;
    if (!base || base.excluded) continue;
    const e: any = emp.get(id) ?? {};
    out.push({
      gender: e.gender ?? null,
      department: base.department,
      grade: grade.get(id) ?? "No grade",
      monthsService: e.date_of_hire ? completedMonths(e.date_of_hire, cycle.effective_date) : 0,
      pct: mr?.pct ?? null,
      bonus: br?.recommended ?? 0,
      promoted: promoted.has(id),
    });
  }
  return out;
}

export { serviceBand };
