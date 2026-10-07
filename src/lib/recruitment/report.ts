import { STAGES } from "./stages";

export type ReportCandidate = {
  id: string;
  source: string | null;
  stage: string;
  rejection_reason: string | null;
  added_on: string;
};
export type ReportHistory = { candidate_id: string; to_stage: string; changed_at: string };

const DAY = 86_400_000;

// Everything the Recruitment reports page shows, computed from plain rows so it
// can be tested without a database.
export function buildRecruitmentReport(candidates: ReportCandidate[], history: ReportHistory[]) {
  const reached = new Map<string, Set<string>>();
  const hiredAt = new Map<string, number>();
  for (const h of history) {
    if (!reached.has(h.candidate_id)) reached.set(h.candidate_id, new Set());
    reached.get(h.candidate_id)!.add(h.to_stage);
    if (h.to_stage === "Hired") hiredAt.set(h.candidate_id, new Date(h.changed_at).getTime());
  }

  // Funnel: how many candidates ever reached each stage (current stage counts too).
  const funnel = STAGES.filter((s) => s !== "Rejected").map((stage) => ({
    stage,
    count: candidates.filter((c) => reached.get(c.id)?.has(stage) || c.stage === stage).length,
  }));

  const hires = candidates.filter((c) => c.stage === "Hired");
  const days = hires
    .map((c) => {
      const t = hiredAt.get(c.id);
      return t ? Math.max(0, Math.round((t - new Date(c.added_on).getTime()) / DAY)) : null;
    })
    .filter((d): d is number => d !== null);
  const avgTimeToHireDays = days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null;

  const bySource = new Map<string, { applicants: number; hired: number }>();
  for (const c of candidates) {
    const key = (c.source ?? "").trim() || "Unknown";
    const row = bySource.get(key) ?? { applicants: 0, hired: 0 };
    row.applicants++;
    if (c.stage === "Hired") row.hired++;
    bySource.set(key, row);
  }
  const sources = [...bySource.entries()]
    .map(([source, v]) => ({ source, ...v, hireRate: v.applicants ? Math.round((v.hired / v.applicants) * 100) : 0 }))
    .sort((a, b) => b.applicants - a.applicants);

  const reasonCount = new Map<string, number>();
  for (const c of candidates) {
    if (c.stage !== "Rejected") continue;
    const r = (c.rejection_reason ?? "").trim() || "No reason recorded";
    reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
  }
  const rejectionReasons = [...reasonCount.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

  return { total: candidates.length, hired: hires.length, avgTimeToHireDays, funnel, sources, rejectionReasons };
}
