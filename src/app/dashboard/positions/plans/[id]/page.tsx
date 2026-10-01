// Area 16 §7.5 — workforce plan detail: lines, totals, submit/activate/close.
import { createClient } from "@/lib/supabase/server";
import { addWorkforcePlanLine, submitWorkforcePlan, activateWorkforcePlan, closeWorkforcePlan } from "@/lib/positions/workforce-plan-actions";

export default async function WorkforcePlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ data: plan }, { data: lines }, { data: units }, { data: positionTypes }] = await Promise.all([
    supabase.from("workforce_plans").select("*").eq("id", id).eq("org_id", appUser.org_id).maybeSingle(),
    supabase.from("workforce_plan_lines").select("id, organisation_unit_id, position_type_id, grade, planned_headcount, planned_cost, notes, organisation_units(name), position_types(name)").eq("plan_id", id),
    supabase.from("organisation_units").select("id, name").eq("org_id", appUser.org_id).order("name"),
    supabase.from("position_types").select("id, name").eq("org_id", appUser.org_id).order("name"),
  ]);

  if (!plan) return <div className="text-sm text-neutral-500">Plan not found.</div>;

  const totalHeadcount = (lines ?? []).reduce((sum, l) => sum + (l.planned_headcount ?? 0), 0);
  const totalCost = (lines ?? []).reduce((sum, l) => sum + (Number(l.planned_cost) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{plan.name}</h1>
          <p className="text-sm text-neutral-500 mt-1">{plan.planning_period_start} — {plan.planning_period_end}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-600">{plan.status}</span>
          {plan.status === "draft" && (
            <form action={async () => { "use server"; await submitWorkforcePlan(id); }}>
              <button type="submit" className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Submit for approval</button>
            </form>
          )}
          {plan.status === "approved" && (
            <form action={async () => { "use server"; await activateWorkforcePlan(id); }}>
              <button type="submit" className="text-xs bg-green-600 hover:bg-green-700 text-white rounded px-3 py-1.5 font-medium">Activate</button>
            </form>
          )}
          {["active", "approved"].includes(plan.status) && (
            <form action={async () => { "use server"; await closeWorkforcePlan(id); }}>
              <button type="submit" className="text-xs text-neutral-500 hover:underline">Close</button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <p className="text-2xl font-semibold text-neutral-900">{totalHeadcount}</p>
          <p className="text-xs text-neutral-500 mt-1">Planned headcount</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <p className="text-2xl font-semibold text-neutral-900">KES {totalCost.toLocaleString()}</p>
          <p className="text-xs text-neutral-500 mt-1">Planned cost</p>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 p-4 pb-0">Plan lines</h2>
        <table className="w-full text-sm mt-2">
          <tbody>
            {(lines ?? []).map((l) => {
              const unit = l.organisation_units as unknown as { name: string } | null;
              const type = l.position_types as unknown as { name: string } | null;
              return (
                <tr key={l.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-xs text-neutral-600">{unit?.name ?? "Org-wide"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{type?.name ?? "—"} {l.grade ? `(${l.grade})` : ""}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">HC {l.planned_headcount}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{l.planned_cost ? `KES ${Number(l.planned_cost).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-400">{l.notes}</td>
                </tr>
              );
            })}
            {(lines ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={5}>No lines yet.</td></tr>
            )}
          </tbody>
        </table>
        {plan.status === "draft" && (
          <form action={addWorkforcePlanLine} className="grid grid-cols-1 sm:grid-cols-6 gap-2 text-xs p-4 border-t border-neutral-100">
            <input type="hidden" name="plan_id" value={id} />
            <select name="organisation_unit_id" className="border border-neutral-200 rounded px-2 py-1.5">
              <option value="">Org unit…</option>
              {(units ?? []).map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
            <select name="position_type_id" className="border border-neutral-200 rounded px-2 py-1.5">
              <option value="">Position type…</option>
              {(positionTypes ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
            <input name="grade" placeholder="Grade (optional)" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="planned_headcount" type="number" min="0" placeholder="Headcount" required className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="planned_cost" type="number" step="0.01" placeholder="Cost (optional)" className="border border-neutral-200 rounded px-2 py-1.5" />
            <button type="submit" className="bg-neutral-900 hover:bg-neutral-800 text-white rounded px-3 py-1.5 font-medium">Add line</button>
          </form>
        )}
      </div>
    </div>
  );
}
