// Performance Insights (spec §8). Every insight here is a direct
// restatement of documented data — goal status, ratings that already
// exist, review completion — never an inference about personality,
// motivation, health or intent (spec §8.3's hard line). The insight text
// always follows the spec's own example pattern: a factual claim, the
// evidence behind it, and a suggested next action, nothing else.
import type { SupabaseClient } from "@supabase/supabase-js";

const STALL_DAYS = 21;
const REVIEW_OVERDUE_DAYS = 45;

type NewInsight = {
  entity_id: string;
  title: string;
  body: string;
  evidence_json: Record<string, unknown>[];
  suggested_action: string;
  severity: "info" | "attention" | "high";
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export async function generatePerformanceInsights(
  supabase: SupabaseClient,
  orgId: string,
  employeeIds: string[]
): Promise<{ insightCount: number }> {
  if (employeeIds.length === 0) return { insightCount: 0 };

  const { data: model } = await supabase
    .from("ai_models")
    .select("id")
    .eq("org_id", orgId)
    .eq("key", "performance-insight-generator")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const { data: appraisals } = await supabase
    .from("appraisals")
    .select("id, employee_id, cycle, status, created_at, employees(name)")
    .in("employee_id", employeeIds)
    .order("created_at", { ascending: false });

  type GoalRow = { id: string; appraisal_id: string; goal_text: string; weight: number; self_rating: number | null; manager_rating: number | null; updated_at: string };
  const appraisalIds = (appraisals ?? []).map((a) => a.id);
  const { data: goals } = appraisalIds.length
    ? await supabase.from("appraisal_goals").select("id, appraisal_id, goal_text, weight, self_rating, manager_rating, updated_at").in("appraisal_id", appraisalIds)
    : { data: [] as GoalRow[] };

  const goalsByAppraisal = new Map<string, GoalRow[]>();
  for (const g of (goals ?? []) as GoalRow[]) {
    const list = goalsByAppraisal.get(g.appraisal_id) ?? [];
    list.push(g);
    goalsByAppraisal.set(g.appraisal_id, list);
  }

  const insightsByEmployee = new Map<string, NewInsight[]>();
  function push(employeeId: string, insight: NewInsight) {
    const list = insightsByEmployee.get(employeeId) ?? [];
    list.push(insight);
    insightsByEmployee.set(employeeId, list);
  }

  for (const appraisal of appraisals ?? []) {
    // Only the current/most-recent cycle per employee is evaluated —
    // appraisals is already ordered newest-first above, so skip an
    // employee once their latest cycle has been processed.
    if (insightsByEmployee.has(appraisal.employee_id)) continue;

    const employeeName = (appraisal.employees as unknown as { name: string } | null)?.name ?? "This employee";
    const cycleGoals = (goalsByAppraisal.get(appraisal.id) ?? []) as { id: string; goal_text: string; weight: number; self_rating: number | null; manager_rating: number | null; updated_at: string }[];

    if (appraisal.status === "In Progress") {
      const stalled = cycleGoals.filter((g) => g.manager_rating === null && daysSince(g.updated_at) >= STALL_DAYS);
      if (stalled.length > 0 && cycleGoals.length > 0) {
        const onTrack = cycleGoals.length - stalled.length;
        push(appraisal.employee_id, {
          entity_id: appraisal.employee_id,
          title: `${stalled.length} of ${cycleGoals.length} active goal(s) stalled`,
          body: `${onTrack} of ${employeeName}'s ${cycleGoals.length} active goals have a manager rating on file. The other ${stalled.length} — ${stalled.map((g) => `"${g.goal_text}"`).join(", ")} — ${stalled.length === 1 ? "has" : "have"} had no update for ${Math.min(...stalled.map((g) => daysSince(g.updated_at)))}+ days.`,
          evidence_json: stalled.map((g) => ({ goal: g.goal_text, days_since_update: daysSince(g.updated_at), weight: g.weight })),
          suggested_action: "Discuss the blocked goal(s) in the next 1:1 and agree a next milestone.",
          severity: "attention",
        });
      }

      if (daysSince(appraisal.created_at) >= REVIEW_OVERDUE_DAYS && cycleGoals.every((g) => g.manager_rating === null)) {
        push(appraisal.employee_id, {
          entity_id: appraisal.employee_id,
          title: `Appraisal cycle "${appraisal.cycle}" has no manager ratings after ${daysSince(appraisal.created_at)} days`,
          body: `${employeeName}'s "${appraisal.cycle}" appraisal was opened ${daysSince(appraisal.created_at)} days ago and has no manager rating recorded on any goal yet.`,
          evidence_json: [{ appraisal_cycle: appraisal.cycle, opened_days_ago: daysSince(appraisal.created_at), goal_count: cycleGoals.length }],
          suggested_action: "Complete the manager review for this cycle, or confirm a revised timeline with the employee.",
          severity: "attention",
        });
      }
    }

    if (appraisal.status === "Completed" && cycleGoals.length > 0) {
      const allStrong = cycleGoals.every((g) => (g.manager_rating ?? 0) >= 4);
      if (allStrong) {
        push(appraisal.employee_id, {
          entity_id: appraisal.employee_id,
          title: `All goals rated 4+ this cycle`,
          body: `${employeeName} was rated 4 or higher on all ${cycleGoals.length} goals in the "${appraisal.cycle}" cycle.`,
          evidence_json: cycleGoals.map((g) => ({ goal: g.goal_text, manager_rating: g.manager_rating })),
          suggested_action: "Recognise this progress and consider it for development/growth conversations.",
          severity: "info",
        });
      }
    }
  }

  const found = Array.from(insightsByEmployee.entries()).flatMap(([, list]) => list);

  // Replace this batch's open, auto-generated performance insights for the
  // employees just evaluated — same convention as the payroll exceptions/
  // anomaly engines (recompute replaces stale open findings, never touches
  // one a human has already acted on).
  await supabase.from("ai_insights").delete().eq("org_id", orgId).eq("category", "performance").eq("status", "open").in("entity_id", employeeIds);

  if (found.length > 0) {
    await supabase.from("ai_insights").insert(
      found.map((f) => ({
        org_id: orgId,
        model_id: model?.id ?? null,
        category: "performance",
        entity_type: "employee",
        entity_id: f.entity_id,
        title: f.title,
        body: f.body,
        evidence_json: f.evidence_json,
        suggested_action: f.suggested_action,
        severity: f.severity,
      }))
    );
  }

  return { insightCount: found.length };
}
