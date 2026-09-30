import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { decideAnomaly } from "./actions";

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
  informational: "bg-neutral-50 text-neutral-600 border-neutral-200",
};

export default async function PayrollAnomaliesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const activeStatus = status ?? "open";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">
        Payroll Intelligence is visible to HR and admin roles.
      </div>
    );
  }

  // entity_id is a polymorphic reference (employee/department/run) with no
  // declared foreign key, so PostgREST can't embed it directly — names are
  // joined in a second query below instead.
  let anomalyQuery = supabase
    .from("ai_anomalies")
    .select(
      "id, anomaly_type, entity_type, entity_id, severity, score, expected_value, actual_value, drivers_json, explanation, status, reviewer_note, created_at, payroll_runs(id, period)"
    )
    .eq("org_id", appUser.org_id);
  if (activeStatus !== "all") anomalyQuery = anomalyQuery.eq("status", activeStatus);
  const { data: anomalies } = await anomalyQuery.order("created_at", { ascending: false });

  type Row = {
    id: string;
    anomaly_type: string;
    entity_type: string;
    entity_id: string | null;
    severity: "informational" | "review" | "high";
    score: number | null;
    expected_value: number | null;
    actual_value: number | null;
    drivers_json: { factor: string; value: unknown; reason?: string }[];
    explanation: string;
    status: string;
    reviewer_note: string | null;
    created_at: string;
    payroll_runs: { id: string; period: string } | null;
    employees: { name: string } | null;
  };

  const rawRows = (anomalies ?? []) as unknown as Omit<Row, "employees">[];
  const employeeIds = Array.from(new Set(rawRows.filter((r) => r.entity_type === "employee" && r.entity_id).map((r) => r.entity_id as string)));
  const { data: namedEmployees } = employeeIds.length
    ? await supabase.from("employees").select("id, name").in("id", employeeIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((namedEmployees ?? []).map((e) => [e.id, e.name]));
  const rows: Row[] = rawRows.map((r) => ({ ...r, employees: r.entity_id && nameById.has(r.entity_id) ? { name: nameById.get(r.entity_id)! } : null }));
  // Sort by financial impact (|actual - expected|) then severity, per spec §6.4.
  const severityRank = { high: 0, review: 1, informational: 2 };
  const sorted = [...rows].sort((a, b) => {
    const impactA = Math.abs((a.actual_value ?? 0) - (a.expected_value ?? 0));
    const impactB = Math.abs((b.actual_value ?? 0) - (b.expected_value ?? 0));
    if (severityRank[a.severity] !== severityRank[b.severity]) return severityRank[a.severity] - severityRank[b.severity];
    return impactB - impactA;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Payroll Intelligence — AI Anomalies</h1>
        <p className="text-sm text-neutral-500 mt-1">
          A statistical scan that complements the deterministic payroll checks. Nothing here changes a payslip automatically — every
          row needs a human decision.
        </p>
      </div>

      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {["open", "reviewed", "resolved", "false_positive", "all"].map((s) => (
          <Link
            key={s}
            href={`/dashboard/payroll/anomalies?status=${s}`}
            className={`px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeStatus === s ? "border-brand-600 text-brand-700" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-8 text-sm text-neutral-500 text-center">
          No anomalies in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => (
            <div key={a.id} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[a.severity]}`}>{a.severity}</span>
                    <span className="text-sm font-medium text-neutral-900">{a.anomaly_type.replace(/_/g, " ")}</span>
                    {a.payroll_runs && (
                      <Link href={`/dashboard/payroll/${a.payroll_runs.id}`} className="text-xs text-brand-600 hover:underline">
                        Run: {a.payroll_runs.period}
                      </Link>
                    )}
                    {a.entity_type === "employee" && a.employees && (
                      <Link href={`/dashboard/employees/${a.entity_id}`} className="text-xs text-brand-600 hover:underline">
                        {a.employees.name}
                      </Link>
                    )}
                  </div>
                  <p className="text-sm text-neutral-700 mt-2">{a.explanation}</p>
                  {a.drivers_json?.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {a.drivers_json.map((d, i) => (
                        <li key={i} className="text-xs bg-neutral-50 border border-neutral-200 rounded-full px-2 py-0.5 text-neutral-600">
                          {d.factor}: {String(d.value)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {a.reviewer_note && <p className="mt-2 text-xs text-neutral-500">Reviewer note: {a.reviewer_note}</p>}
                </div>
                <span className="text-xs text-neutral-400 whitespace-nowrap">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>

              {a.status === "open" && (
                <form action={decideAnomaly} className="mt-4 flex items-end gap-2 flex-wrap">
                  <input type="hidden" name="anomaly_id" value={a.id} />
                  <input
                    name="note"
                    placeholder="Note (optional)"
                    className="flex-1 min-w-[180px] border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-1.5"
                  />
                  <button name="decision" value="reviewed" className="text-sm border border-neutral-300 rounded-lg px-3 py-1.5 hover:bg-neutral-50 transition-colors">
                    Mark expected
                  </button>
                  <button name="decision" value="resolved" className="text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 transition-colors">
                    Resolve
                  </button>
                  <button name="decision" value="false_positive" className="text-sm border border-neutral-300 rounded-lg px-3 py-1.5 hover:bg-neutral-50 transition-colors">
                    False positive
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
