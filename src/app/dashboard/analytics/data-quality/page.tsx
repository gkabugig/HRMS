// Area 10 §5.9 / §13 Data Quality screen. Lists open findings from the
// most recent scan and lets HR/admin trigger a fresh scan or resolve a
// finding (which means the underlying record was actually fixed — the scan
// will reopen the same row if it detects the condition again).
import { createClient } from "@/lib/supabase/server";
import { resolveDataQualityEvent, triggerDataQualityScan } from "@/lib/intelligence/data-quality/actions";
import EmptyState from "@/components/employee-portal/empty-state";

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-neutral-100 text-neutral-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

async function scanAction() {
  "use server";
  await triggerDataQualityScan();
}

export default async function DataQualityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">
        Data Quality is visible to HR and admin roles.
      </div>
    );
  }

  const { data: events } = await supabase
    .from("analytics_data_quality_events")
    .select("id, issue_code, issue_category, entity_type, entity_id, severity, description, detected_at, resolved_at")
    .is("resolved_at", null)
    .order("severity", { ascending: false })
    .order("detected_at", { ascending: false })
    .limit(200);

  const { count: resolvedCount } = await supabase
    .from("analytics_data_quality_events")
    .select("id", { count: "exact", head: true })
    .not("resolved_at", "is", null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Data Quality</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Findings that affect confidence in analytics, forecasts and planning (§5.9). Forecasts are blocked or flagged when open
            findings are severe enough.
          </p>
        </div>
        <form action={scanAction}>
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
            Run scan now
          </button>
        </form>
      </div>

      <p className="text-xs text-neutral-400">
        {events?.length ?? 0} open finding{(events?.length ?? 0) === 1 ? "" : "s"} · {resolvedCount ?? 0} resolved to date. Some §5.9
        check types (compensation-outside-band, generalised orphaned-reference scanning, missing-required-document) are not yet wired —
        the first two depend on Area 17 / a mandatory-document configuration that doesn&apos;t exist yet.
      </p>

      {events && events.length > 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Severity</th>
                <th className="px-4 py-2 font-medium">Issue</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Detected</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SEVERITY_STYLE[e.severity] ?? ""}`}>
                      {e.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-700 whitespace-nowrap">{e.issue_code.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-neutral-700">{e.description}</td>
                  <td className="px-4 py-2 text-neutral-400 text-xs whitespace-nowrap">{new Date(e.detected_at).toLocaleDateString("en-KE")}</td>
                  <td className="px-4 py-2">
                    <form id={`resolve-${e.id}`} action={resolveDataQualityEvent}>
                      <input type="hidden" name="id" value={e.id} />
                    </form>
                    <input
                      form={`resolve-${e.id}`}
                      name="resolution_note"
                      placeholder="Resolution note"
                      className="border border-neutral-200 rounded px-2 py-1 text-xs mr-2 w-32"
                    />
                    <button form={`resolve-${e.id}`} type="submit" className="text-xs text-brand-600 hover:underline">
                      Mark resolved
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <EmptyState message="No open data-quality findings. Run a scan to check for new ones." />
        </div>
      )}
    </div>
  );
}
