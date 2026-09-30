import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { generatePerformanceInsights } from "@/lib/intelligence/performance-insights/generate-performance-insights";
import { decideInsight, leaveFeedback } from "./actions";

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  attention: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default async function PerformanceInsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id, employee_id").eq("id", user!.id).maybeSingle();

  if (!appUser || appUser.role === "employee") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">
        Performance Insights is visible to managers, HR and admin.
      </div>
    );
  }

  // Only HR/admin can write ai_insights (RLS), so generation runs here;
  // a manager visiting this page just reads whatever's on file for their
  // own reports (RLS already scopes the select to that).
  if (appUser.role === "admin" || appUser.role === "hr") {
    const { data: activeEmployees } = await supabase.from("employees").select("id").eq("status", "Active");
    await generatePerformanceInsights(supabase, appUser.org_id, (activeEmployees ?? []).map((e) => e.id));
  }

  // entity_id has no declared foreign key (it's polymorphic — employee,
  // department, goal, ...), so employee names are joined separately here
  // rather than via a PostgREST embed.
  const { data: insights } = await supabase
    .from("ai_insights")
    .select("id, entity_id, title, body, evidence_json, suggested_action, severity, status, created_at")
    .eq("category", "performance")
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    entity_id: string;
    title: string;
    body: string;
    evidence_json: Record<string, unknown>[];
    suggested_action: string;
    severity: "info" | "attention" | "high";
    status: string;
    created_at: string;
    employees: { name: string; department: string } | null;
  };
  const rawRows = (insights ?? []) as unknown as Omit<Row, "employees">[];
  const employeeIds = Array.from(new Set(rawRows.map((r) => r.entity_id)));
  const { data: namedEmployees } = employeeIds.length
    ? await supabase.from("employees").select("id, name, department").in("id", employeeIds)
    : { data: [] as { id: string; name: string; department: string }[] };
  const empById = new Map((namedEmployees ?? []).map((e) => [e.id, { name: e.name, department: e.department }]));
  const rows: Row[] = rawRows.map((r) => ({ ...r, employees: empById.get(r.entity_id) ?? null }));
  const open = rows.filter((r) => r.status === "open");
  const decided = rows.filter((r) => r.status !== "open");
  const canDecide = appUser.role === "admin" || appUser.role === "hr";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Performance Insights</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Evidence-linked coaching signals from documented goals and ratings — never a label on the person, only on the record.
        </p>
      </div>

      {open.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-8 text-sm text-neutral-500 text-center">
          No open insights right now.
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((i) => (
            <div key={i.id} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[i.severity]}`}>{i.severity}</span>
                    {i.employees && (
                      <Link href={`/dashboard/employees/${i.entity_id}`} className="text-sm font-medium text-brand-600 hover:underline">
                        {i.employees.name}
                      </Link>
                    )}
                    <span className="text-xs text-neutral-400">{i.employees?.department}</span>
                  </div>
                  <p className="text-sm font-medium text-neutral-900 mt-2">{i.title}</p>
                  <p className="text-sm text-neutral-700 mt-1">{i.body}</p>
                  <p className="text-xs text-brand-700 mt-2">Suggested: {i.suggested_action}</p>
                </div>
                <span className="text-xs text-neutral-400 whitespace-nowrap">{new Date(i.created_at).toLocaleDateString()}</span>
              </div>

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {canDecide && (
                  <form action={decideInsight} className="flex gap-2">
                    <input type="hidden" name="insight_id" value={i.id} />
                    <button name="decision" value="acknowledged" className="text-sm border border-neutral-300 rounded-lg px-3 py-1.5 hover:bg-neutral-50 transition-colors">
                      Acknowledge
                    </button>
                    <button name="decision" value="resolved" className="text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 transition-colors">
                      Resolve
                    </button>
                    <button name="decision" value="dismissed" className="text-sm border border-neutral-300 rounded-lg px-3 py-1.5 hover:bg-neutral-50 transition-colors">
                      Dismiss
                    </button>
                  </form>
                )}
                <form action={leaveFeedback} className="flex gap-1">
                  <input type="hidden" name="insight_id" value={i.id} />
                  <button name="feedback_type" value="useful" className="text-xs text-neutral-400 hover:text-neutral-700" title="Useful">
                    👍
                  </button>
                  <button name="feedback_type" value="not_useful" className="text-xs text-neutral-400 hover:text-neutral-700" title="Not useful">
                    👎
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-500">Reviewed / resolved ({decided.length})</summary>
          <div className="mt-3 space-y-2">
            {decided.map((i) => (
              <div key={i.id} className="border border-[var(--border-subtle)] rounded-lg p-3 text-sm text-neutral-500">
                <span className="font-medium text-neutral-700">{i.employees?.name}</span> — {i.title}{" "}
                <span className="text-xs uppercase tracking-wide">({i.status})</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
