// Area 11 Risk Detail (§13). Full lifecycle, evidence, comments,
// remediation actions and owner assignment for a single risk.
import { createClient } from "@/lib/supabase/server";
import {
  addRiskComment,
  assignRiskOwner,
  completeRiskAction,
  createRiskAction,
  updateRiskStatus,
} from "@/lib/intelligence/risk/actions";

const STATUS_OPTIONS = [
  "detected", "triaged", "assigned", "investigating", "remediation_required",
  "resolved", "verified", "closed", "dismissed", "duplicate", "accepted",
];

export default async function RiskDetailPage({ params }: { params: Promise<{ riskId: string }> }) {
  const { riskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id, id").eq("id", user!.id).maybeSingle();
  if (!appUser) return null;
  const isAdminOrHr = ["admin", "hr"].includes(appUser.role);

  const { data: risk } = await supabase.from("workforce_risks").select("*").eq("id", riskId).maybeSingle();
  if (!risk) {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Risk not found or not visible to you.</div>;
  }

  const [{ data: events }, { data: actions }, { data: comments }, { data: orgUsers }] = await Promise.all([
    supabase.from("workforce_risk_events").select("id, event_type, from_status, to_status, note, created_at, actor_user_id").eq("risk_id", riskId).order("created_at", { ascending: false }),
    supabase.from("workforce_risk_actions").select("id, title, description, status, due_at, completed_at, assigned_to").eq("risk_id", riskId).order("created_at", { ascending: true }),
    isAdminOrHr
      ? supabase.from("workforce_risk_comments").select("id, body, visibility, created_at, author_user_id").eq("risk_id", riskId).order("created_at", { ascending: true })
      : supabase.from("workforce_risk_comments").select("id, body, visibility, created_at, author_user_id").eq("risk_id", riskId).eq("visibility", "employee_visible").order("created_at", { ascending: true }),
    isAdminOrHr ? supabase.from("app_users").select("id, role").eq("org_id", appUser.org_id) : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">{risk.rule_code} · {risk.category.replace(/_/g, " ")}</p>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mt-1">{risk.title}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">{risk.description}</p>
        <div className="flex gap-3 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Score {Number(risk.risk_score).toFixed(0)}</span>
          <span>Severity: {risk.severity}</span>
          <span>Status: {risk.status}</span>
          <span>First detected {new Date(risk.first_detected_at).toLocaleDateString("en-KE")}</span>
        </div>
      </div>

      {Array.isArray(risk.evidence_json) && risk.evidence_json.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Evidence</h2>
          <pre className="text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900 rounded p-3 overflow-x-auto">{JSON.stringify(risk.evidence_json, null, 2)}</pre>
        </div>
      )}

      {isAdminOrHr && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Manage</h2>

          <form action={updateRiskStatus} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="risk_id" value={riskId} />
            <div>
              <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Change status</label>
              <select name="status" defaultValue={risk.status} className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <input name="note" placeholder="Note (optional)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm flex-1 min-w-[160px]" />
            <input name="acceptance_rationale" placeholder="Rationale (required if accepting)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm flex-1 min-w-[160px]" />
            <input name="acceptance_expiry" type="date" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm" />
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium">
              Update
            </button>
          </form>

          <form action={assignRiskOwner} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="risk_id" value={riskId} />
            <div>
              <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Assign owner</label>
              <select name="owner_user_id" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm" required>
                <option value="">Select a user…</option>
                {(orgUsers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.id} ({u.role})</option>
                ))}
              </select>
            </div>
            <button type="submit" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 hover:dark:bg-neutral-900">
              Assign
            </button>
          </form>

          <form action={createRiskAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="risk_id" value={riskId} />
            <input name="title" placeholder="Remediation task title" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm flex-1 min-w-[160px]" />
            <input name="due_at" type="date" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm" />
            <button type="submit" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 hover:dark:bg-neutral-900">
              Add remediation task
            </button>
          </form>
        </div>
      )}

      {actions && actions.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Remediation tasks</h2>
          <ul className="divide-y divide-neutral-50 text-sm">
            {actions.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                <span className={a.status === "done" ? "line-through text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-200"}>{a.title}</span>
                {a.status !== "done" && isAdminOrHr && (
                  <form action={completeRiskAction}>
                    <input type="hidden" name="action_id" value={a.id} />
                    <input type="hidden" name="risk_id" value={riskId} />
                    <button type="submit" className="text-xs text-brand-600 hover:underline">Mark done</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Comments</h2>
        <ul className="space-y-2 text-sm mb-3">
          {(comments ?? []).map((c) => (
            <li key={c.id} className="bg-neutral-50 dark:bg-neutral-900 rounded p-2">
              <p className="text-neutral-700 dark:text-neutral-200">{c.body}</p>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">{new Date(c.created_at).toLocaleString("en-KE")} · {c.visibility}</p>
            </li>
          ))}
          {(!comments || comments.length === 0) && <p className="text-xs text-neutral-400 dark:text-neutral-500">No comments yet.</p>}
        </ul>
        {isAdminOrHr && (
          <form action={addRiskComment} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="risk_id" value={riskId} />
            <input name="body" placeholder="Add a comment" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm flex-1 min-w-[200px]" />
            <select name="visibility" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 text-sm">
              <option value="internal">Internal</option>
              <option value="employee_visible">Employee-visible</option>
            </select>
            <button type="submit" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 hover:dark:bg-neutral-900">
              Post
            </button>
          </form>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">History</h2>
        <ul className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
          {(events ?? []).map((e) => (
            <li key={e.id}>
              {new Date(e.created_at).toLocaleString("en-KE")} — {e.event_type}
              {e.from_status && e.to_status ? ` (${e.from_status} → ${e.to_status})` : ""}
              {e.note ? `: ${e.note}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
