// Area 11 Workforce Risk Centre — combines the spec's Risk Dashboard,
// Risk Register, Remediation Queue and Risk Analytics screens (§13) into
// one page with summary cards, a filterable register and a remediation
// view, to keep the screen count manageable. Risk Detail is its own page
// (./[riskId]) and Rules/suppressions are on ./rules.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { triggerRiskScan } from "@/lib/intelligence/risk/actions";

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-neutral-100 text-neutral-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  detected: "Detected",
  triaged: "Triaged",
  assigned: "Assigned",
  investigating: "Investigating",
  remediation_required: "Remediation Required",
  resolved: "Resolved",
  verified: "Verified",
  closed: "Closed",
  dismissed: "Dismissed",
  duplicate: "Duplicate",
  accepted: "Accepted",
};

async function scanAction() {
  "use server";
  await triggerRiskScan();
}

export default async function RiskCentrePage({ searchParams }: { searchParams: Promise<{ severity?: string; category?: string; status?: string }> }) {
  const { severity, category, status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();
  if (!appUser) return null;

  const isAdminOrHr = ["admin", "hr"].includes(appUser.role);

  let query = supabase
    .from("workforce_risks")
    .select("id, rule_code, title, category, status, severity, risk_score, entity_type, entity_id, owner_user_id, last_detected_at")
    .order("risk_score", { ascending: false })
    .limit(200);
  if (severity) query = query.eq("severity", severity);
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);
  else query = query.not("status", "in", "(closed,dismissed,duplicate)");

  const { data: risks } = await query;

  const { data: allOpen } = await supabase
    .from("workforce_risks")
    .select("severity, category, status")
    .not("status", "in", "(closed,dismissed,duplicate)");

  const bySeverity = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const r of allOpen ?? []) {
    bySeverity.set(r.severity, (bySeverity.get(r.severity) ?? 0) + 1);
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  }

  const remediationQueue = (risks ?? []).filter((r) => r.status === "remediation_required");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Workforce Risk Centre</h1>
          <p className="text-sm text-neutral-500 mt-1">
            What requires attention, why, who owns it, what evidence supports it, and has it been resolved (§6.1).
          </p>
        </div>
        {isAdminOrHr && (
          <div className="flex gap-2">
            <Link href="/dashboard/risk/rules" className="text-sm border border-neutral-300 rounded-lg px-3 py-2 hover:bg-neutral-50">
              Rules &amp; Suppressions
            </Link>
            <form action={scanAction}>
              <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
                Run risk scan
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["critical", "high", "medium", "low"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard/risk?severity=${s}`}
            className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4 hover:border-neutral-300 transition-colors"
          >
            <p className="text-xs text-neutral-500 capitalize">{s}</p>
            <p className={`mt-1 text-2xl font-semibold ${SEVERITY_STYLE[s]?.split(" ")[1] ?? "text-neutral-900"}`}>{bySeverity.get(s) ?? 0}</p>
          </Link>
        ))}
      </div>

      {byCategory.size > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-2">Open risks by category</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {Array.from(byCategory.entries()).map(([cat, count]) => (
              <Link key={cat} href={`/dashboard/risk?category=${cat}`} className="bg-neutral-100 rounded-full px-3 py-1 hover:bg-neutral-200">
                {cat.replace(/_/g, " ")}: {count}
              </Link>
            ))}
          </div>
        </div>
      )}

      {remediationQueue.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-2">Remediation queue ({remediationQueue.length})</h2>
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Last detected</th>
            </tr>
          </thead>
          <tbody>
            {(risks ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SEVERITY_STYLE[r.severity] ?? ""}`}>{r.severity}</span>
                </td>
                <td className="px-4 py-2 text-neutral-500 text-xs">{Number(r.risk_score).toFixed(0)}</td>
                <td className="px-4 py-2">
                  <Link href={`/dashboard/risk/${r.id}`} className="text-brand-700 hover:underline font-medium">
                    {r.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-600 text-xs whitespace-nowrap">{r.category.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 text-neutral-600 text-xs whitespace-nowrap">{STATUS_LABEL[r.status]}</td>
                <td className="px-4 py-2 text-neutral-400 text-xs whitespace-nowrap">{new Date(r.last_detected_at).toLocaleDateString("en-KE")}</td>
              </tr>
            ))}
            {(risks ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-400">
                  No open risks match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
