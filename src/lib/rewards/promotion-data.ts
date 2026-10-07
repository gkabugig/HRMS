// Gathers what the promotion gates need (locked reviews, time in grade,
// discipline, vacancies, target band) for a set of employees in one pass.
import { scoreToPct, roundMoney } from "./engine";
import { DEFAULT_PROMOTION_RULE, evaluateGates, monthsInGradeFrom, type Gate, type PromotionRuleConfig } from "./promotion-engine";
import type { Db } from "./context";

export type RuleRow = { id: string; from_grade_id: string; to_grade_id: string; config: PromotionRuleConfig; is_active: boolean };

export type Candidate = {
  employeeId: string;
  name: string;
  staffNo: string;
  department: string;
  jobTitle: string;
  salary: number;
  fromGradeId: string;
  rule: RuleRow;
  gates: Gate[];
  allPassed: boolean;
  avgPerformancePct: number;
  monthsInGrade: number;
  newBandMin: number | null;
};

export function mergeRule(c: Partial<PromotionRuleConfig> | null | undefined): PromotionRuleConfig {
  return {
    ...DEFAULT_PROMOTION_RULE,
    ...(c ?? {}),
    weights: { ...DEFAULT_PROMOTION_RULE.weights, ...(c?.weights ?? {}) },
    cutoffs: { ...DEFAULT_PROMOTION_RULE.cutoffs, ...(c?.cutoffs ?? {}) },
  };
}

export async function buildCandidates(db: Db, orgId: string, opts: { employeeId?: string; asOf: string; proposedTitle?: string }): Promise<Candidate[]> {
  const [{ data: rules }, empQ] = await Promise.all([
    db.from("promotion_rules").select("id, from_grade_id, to_grade_id, config, is_active").eq("org_id", orgId).eq("is_active", true),
    opts.employeeId
      ? db.from("employees").select("id, name, staff_no, department, job_title, basic, status").eq("org_id", orgId).eq("id", opts.employeeId)
      : db.from("employees").select("id, name, staff_no, department, job_title, basic, status").eq("org_id", orgId).eq("status", "Active"),
  ]);
  const ruleRows = ((rules ?? []) as unknown as RuleRow[]).map((r) => ({ ...r, config: mergeRule(r.config) }));
  const employees = (empQ.data ?? []).filter((e) => e.status === "Active");
  if (ruleRows.length === 0 || employees.length === 0) return [];
  const ids = employees.map((e) => e.id as string);

  const [{ data: history }, { data: appraisals }, { data: cases }, { data: vacancies }, { data: bands }] = await Promise.all([
    db.from("employee_compensation_history").select("employee_id, grade_id, effective_from, effective_to").in("employee_id", ids),
    db.from("appraisals").select("employee_id, final_score, created_at").eq("status", "Completed").in("employee_id", ids),
    db.from("disciplinary_actions").select("employee_id").is("outcome", null).in("employee_id", ids),
    db.from("positions").select("title").eq("org_id", orgId).eq("status", "vacant"),
    db.from("compensation_bands").select("grade_id, min_amount, effective_from, effective_to").eq("org_id", orgId).lte("effective_from", opts.asOf),
  ]);

  const openCase = new Set((cases ?? []).map((c) => c.employee_id as string));
  const bandMin = new Map<string, number>();
  for (const b of [...(bands ?? [])].sort((x, y) => String(x.effective_from).localeCompare(String(y.effective_from)))) {
    if (!b.effective_to || b.effective_to >= opts.asOf) bandMin.set(b.grade_id as string, Number(b.min_amount));
  }

  const out: Candidate[] = [];
  for (const e of employees) {
    const rows = (history ?? []).filter((h) => h.employee_id === e.id).sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
    const current = rows.find((r) => !r.effective_to) ?? rows[0];
    if (!current?.grade_id) continue;
    // Walk back while the grade stays the same to find when this grade began.
    let since = current.effective_from as string;
    for (const r of rows) {
      if (r.grade_id === current.grade_id) since = r.effective_from as string;
      else break;
    }
    const monthsInGrade = monthsInGradeFrom(since, opts.asOf);
    const scores = (appraisals ?? [])
      .filter((a) => a.employee_id === e.id && a.final_score !== null)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((a) => scoreToPct(Number(a.final_score)));

    for (const rule of ruleRows.filter((r) => r.from_grade_id === current.grade_id)) {
      const titleMatch = opts.proposedTitle ? (vacancies ?? []).some((v) => String(v.title).toLowerCase().includes(opts.proposedTitle!.toLowerCase())) : (vacancies ?? []).length > 0;
      const { gates, allPassed } = evaluateGates(
        { recentScoresPct: scores, monthsInGrade, hasOpenDiscipline: openCase.has(e.id as string), vacancyExists: rule.config.requireVacancy ? titleMatch : null },
        rule.config
      );
      const recent = scores.slice(0, rule.config.performanceCycles);
      out.push({
        employeeId: e.id as string,
        name: e.name as string,
        staffNo: e.staff_no as string,
        department: e.department as string,
        jobTitle: e.job_title as string,
        salary: Number(e.basic ?? 0),
        fromGradeId: current.grade_id as string,
        rule,
        gates,
        allPassed,
        avgPerformancePct: recent.length ? roundMoney(recent.reduce((s, n) => s + n, 0) / recent.length, 1) : 0,
        monthsInGrade,
        newBandMin: bandMin.get(rule.to_grade_id) ?? null,
      });
    }
  }
  return out;
}
