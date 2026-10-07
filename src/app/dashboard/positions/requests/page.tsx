// Area 16 §7.7 — submit a create/change/freeze/unfreeze/close request and
// see the register of past requests. Any signed-in user with an org context
// can submit (e.g. a department head requesting a new position); approval
// happens in the universal /dashboard/approvals inbox.
import { createClient } from "@/lib/supabase/server";
import { submitPositionRequest } from "@/lib/positions/position-request-actions";
import PositionRequestActions from "./request-actions";

export default async function PositionRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user!.id).maybeSingle();
  if (!appUser) return null;

  const [{ data: positions }, { data: positionTypes }, { data: units }, { data: requests }] = await Promise.all([
    supabase.from("positions").select("id, title").eq("org_id", appUser.org_id).eq("is_active", true).order("title"),
    supabase.from("position_types").select("id, name").eq("org_id", appUser.org_id).order("name"),
    supabase.from("organisation_units").select("id, name").eq("org_id", appUser.org_id).order("name"),
    supabase
      .from("position_requests")
      .select("id, request_type, status, justification, created_at, requested_by, payload_json, positions(title)")
      .eq("org_id", appUser.org_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const statusColor: Record<string, string> = {
    submitted: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    withdrawn: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
    draft: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Position Requests</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Create, change, freeze, unfreeze, or close a position — routed through Approvals.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">New request</h2>
        <form action={submitPositionRequest} className="space-y-3 text-xs">
          <select name="request_type" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 w-full sm:w-auto">
            <option value="create">Create new position</option>
            <option value="change">Change existing position</option>
            <option value="freeze">Freeze position</option>
            <option value="unfreeze">Unfreeze position</option>
            <option value="close">Close position</option>
          </select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select name="position_id" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
              <option value="">Existing position (for change/freeze/unfreeze/close)…</option>
              {(positions ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <input name="title" placeholder="Title (for create/change)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
            <input name="position_code" placeholder="Position code (optional)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
            <input name="approved_headcount" type="number" min="1" placeholder="Approved headcount" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
            <select name="organisation_unit_id" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
              <option value="">Organisation unit…</option>
              {(units ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select name="position_type_id" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
              <option value="">Position type…</option>
              {(positionTypes ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <textarea name="justification" placeholder="Justification (required)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 w-full" rows={2} />

          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Submit request</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Position</th>
              <th className="px-4 py-2 font-medium">Justification</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Submitted</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => {
              const pos = r.positions as unknown as { title: string } | null;
              return (
                <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300 capitalize">{r.request_type}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{pos?.title ?? "(new)"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400 max-w-xs truncate">{r.justification}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[r.status] ?? "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-400 dark:text-neutral-500">{new Date(r.created_at).toLocaleDateString("en-KE")}</td>
                  <td className="px-4 py-2 align-top">
                    {r.requested_by === user!.id && r.status === "submitted" ? (
                      <PositionRequestActions
                        id={r.id}
                        requestType={r.request_type}
                        payload={(r.payload_json ?? {}) as Record<string, unknown>}
                        justification={r.justification ?? ""}
                        units={units ?? []}
                        types={positionTypes ?? []}
                      />
                    ) : (
                      <span className="text-xs text-neutral-300 dark:text-neutral-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(requests ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400 dark:text-neutral-500" colSpan={6}>No requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
