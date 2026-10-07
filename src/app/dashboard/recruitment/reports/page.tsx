import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildRecruitmentReport } from "@/lib/recruitment/report";

const card = "bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4";
const h2 = "text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3";

export default async function RecruitmentReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  if (appUser?.role !== "admin" && appUser?.role !== "hr") redirect("/dashboard/recruitment");

  const [{ data: candidates }, { data: reqs }] = await Promise.all([
    supabase.from("candidates").select("id, source, stage, rejection_reason, added_on").limit(5000),
    supabase.from("requisitions").select("status, approval_status"),
  ]);
  const ids = (candidates ?? []).map((c) => c.id as string);
  const { data: history } = ids.length
    ? await supabase.from("candidate_stage_history").select("candidate_id, to_stage, changed_at").in("candidate_id", ids).limit(20000)
    : { data: [] as { candidate_id: string; to_stage: string; changed_at: string }[] };

  const r = buildRecruitmentReport(candidates ?? [], history ?? []);
  const openJobs = (reqs ?? []).filter((x) => x.status === "Open" && x.approval_status === "Approved").length;
  const waiting = (reqs ?? []).filter((x) => x.approval_status === "Pending").length;
  const top = Math.max(1, ...r.funnel.map((f) => f.count));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/recruitment" className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
          ← Recruitment
        </Link>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mt-1">Recruitment reports</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          ["Open jobs", String(openJobs)],
          ["Waiting approval", String(waiting)],
          ["Candidates", String(r.total)],
          ["Average time to hire", r.avgTimeToHireDays === null ? "—" : `${r.avgTimeToHireDays} days`],
        ].map(([label, value]) => (
          <div key={label} className={card}>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
          </div>
        ))}
      </div>

      <div className={card}>
        <h2 className={h2}>Hiring funnel</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">How many candidates reached each stage. A big drop between two stages shows where people are lost.</p>
        <ul className="space-y-2">
          {r.funnel.map((f, i) => {
            const prev = i > 0 ? r.funnel[i - 1].count : null;
            const drop = prev && prev > 0 ? Math.round(((prev - f.count) / prev) * 100) : null;
            return (
              <li key={f.stage} className="text-sm">
                <div className="flex justify-between">
                  <span>{f.stage}</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {f.count}
                    {drop !== null && drop > 0 && ` (−${drop}% from previous)`}
                  </span>
                </div>
                <div className="h-2 rounded bg-neutral-100 dark:bg-neutral-800 mt-1">
                  <div className="h-2 rounded bg-brand-500" style={{ width: `${(f.count / top) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <h2 className={h2}>Where good candidates come from</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500 dark:text-neutral-400 text-xs">
              <tr>
                <th className="py-1 font-medium">Source</th>
                <th className="py-1 font-medium">Applicants</th>
                <th className="py-1 font-medium">Hired</th>
                <th className="py-1 font-medium">Hire rate</th>
              </tr>
            </thead>
            <tbody>
              {r.sources.map((s) => (
                <tr key={s.source} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1.5">{s.source}</td>
                  <td>{s.applicants}</td>
                  <td>{s.hired}</td>
                  <td>{s.hireRate}%</td>
                </tr>
              ))}
              {r.sources.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-neutral-400">No candidates yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={card}>
          <h2 className={h2}>Why candidates were rejected</h2>
          <ul className="space-y-1.5 text-sm">
            {r.rejectionReasons.map((x) => (
              <li key={x.reason} className="flex justify-between border-t border-neutral-100 dark:border-neutral-800 pt-1.5 first:border-0 first:pt-0">
                <span>{x.reason}</span>
                <span className="text-neutral-500 dark:text-neutral-400">{x.count}</span>
              </li>
            ))}
            {r.rejectionReasons.length === 0 && <li className="text-neutral-400">No rejections recorded.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
