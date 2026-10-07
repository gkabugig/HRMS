// Picks the approval chain for a recommendation (spec §12). Pure.
export type Stage = "hr" | "admin" | "head";
export type Workflow = { id: string; name: string; reward_type: string; min_amount: number; max_amount: number | null; exceptions_only: boolean; stages: Stage[]; due_days: number };

export const DEFAULT_CHAIN: { stages: Stage[]; dueDays: number } = { stages: ["hr"], dueDays: 3 };

// The most specific matching workflow wins: a named reward type beats "*", then the higher minimum amount.
export function pickWorkflow(list: Workflow[], i: { rewardType: string; amount: number; isException: boolean }): Workflow | null {
  const hits = list.filter((w) => (w.reward_type === "*" || w.reward_type === i.rewardType) && i.amount >= w.min_amount && (w.max_amount === null || i.amount <= w.max_amount) && (!w.exceptions_only || i.isException));
  hits.sort((a, b) => Number(b.reward_type !== "*") - Number(a.reward_type !== "*") || Number(b.exceptions_only) - Number(a.exceptions_only) || b.min_amount - a.min_amount);
  return hits[0] ?? null;
}

export type ResolvedStage = { approverRole?: string; approverUserId?: string };

// Whoever submits never approves: an HR submitter's HR stage goes to an administrator,
// and the head's stage is dropped if the head is the submitter. Exceptions always add the head.
export function resolveStages(stages: Stage[], i: { submitterRole: string; submitterUserId: string; headUserId: string | null; isException: boolean; hasWorkflow: boolean }): ResolvedStage[] {
  const list: Stage[] = [...stages];
  if (i.isException && !list.includes("head") && !i.hasWorkflow) list.push("head");
  const out: ResolvedStage[] = [];
  for (const s of list) {
    if (s === "hr") out.push({ approverRole: i.submitterRole === "hr" ? "admin" : "hr" });
    else if (s === "admin") out.push({ approverRole: "admin" });
    else if (i.headUserId && i.headUserId !== i.submitterUserId) out.push({ approverUserId: i.headUserId });
  }
  // Collapse back-to-back identical role stages (e.g. hr→admin when the submitter is HR, then admin).
  const dedup = out.filter((s, idx) => idx === 0 || JSON.stringify(s) !== JSON.stringify(out[idx - 1]));
  return dedup.length ? dedup : [{ approverRole: i.submitterRole === "hr" ? "admin" : "hr" }];
}
