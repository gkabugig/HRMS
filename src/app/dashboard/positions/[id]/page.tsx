// Area 16 position detail — version history, budget, and event trail.
import { createClient } from "@/lib/supabase/server";
import { setPositionBudget } from "@/lib/positions/admin-actions";
import { activatePosition } from "@/lib/positions/position-request-actions";

export default async function PositionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ data: position }, { data: versions }, { data: budgets }, { data: events }] = await Promise.all([
    supabase.from("positions").select("*, position_types(name)").eq("id", id).eq("org_id", appUser.org_id).maybeSingle(),
    supabase.from("position_versions").select("version_no, title, lifecycle_status, approved_headcount, change_reason, created_at").eq("position_id", id).order("version_no", { ascending: false }),
    supabase.from("position_budgets").select("id, budget_period_start, budget_period_end, budgeted_amount, currency").eq("position_id", id).order("budget_period_start", { ascending: false }),
    supabase.from("position_events").select("event_type, details, created_at").eq("position_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  if (!position) return <div className="text-sm text-neutral-500">Position not found.</div>;
  const type = position.position_types as unknown as { name: string } | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{position.title}</h1>
          <p className="text-sm text-neutral-500 mt-1">{position.position_code ?? "No code"} · {type?.name ?? "No type"} · Approved headcount {position.approved_headcount}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-600">{position.lifecycle_status}</span>
          {position.lifecycle_status === "approved" && (
            <form action={async () => { "use server"; await activatePosition(id); }}>
              <button type="submit" className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Activate</button>
            </form>
          )}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 p-4 pb-0">Version history</h2>
        <table className="w-full text-sm mt-2">
          <tbody>
            {(versions ?? []).map((v) => (
              <tr key={v.version_no} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-xs text-neutral-500">v{v.version_no}</td>
                <td className="px-4 py-2 text-neutral-800">{v.title}</td>
                <td className="px-4 py-2 text-xs text-neutral-500">{v.lifecycle_status}</td>
                <td className="px-4 py-2 text-xs text-neutral-500">HC {v.approved_headcount}</td>
                <td className="px-4 py-2 text-xs text-neutral-400">{v.change_reason}</td>
                <td className="px-4 py-2 text-xs text-neutral-400">{new Date(v.created_at).toLocaleDateString("en-KE")}</td>
              </tr>
            ))}
            {(versions ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={6}>No versions recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-2">Budget periods</h2>
        <table className="w-full text-sm mb-3">
          <tbody>
            {(budgets ?? []).map((b) => (
              <tr key={b.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-xs text-neutral-500">{b.budget_period_start} — {b.budget_period_end}</td>
                <td className="px-4 py-2 text-neutral-800">{b.currency} {Number(b.budgeted_amount).toLocaleString()}</td>
              </tr>
            ))}
            {(budgets ?? []).length === 0 && (
              <tr><td className="px-4 py-2 text-xs text-neutral-400">No budget set.</td></tr>
            )}
          </tbody>
        </table>
        <form action={setPositionBudget} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <input type="hidden" name="position_id" value={id} />
          <input name="budget_period_start" type="date" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="budget_period_end" type="date" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="budgeted_amount" type="number" step="0.01" placeholder="Amount (KES)" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <button type="submit" className="bg-neutral-900 hover:bg-neutral-800 text-white rounded px-3 py-1.5 font-medium">Set budget</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-2">Event history</h2>
        <ul className="space-y-1">
          {(events ?? []).map((e, i) => (
            <li key={i} className="text-xs text-neutral-500">
              <span className="font-medium text-neutral-700">{e.event_type}</span> — {new Date(e.created_at).toLocaleString("en-KE")}
            </li>
          ))}
          {(events ?? []).length === 0 && <p className="text-xs text-neutral-400">No events recorded.</p>}
        </ul>
      </div>
    </div>
  );
}
