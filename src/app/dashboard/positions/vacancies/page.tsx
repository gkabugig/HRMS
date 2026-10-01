// Area 16 §7.8 — vacancy register distinct from positions.status='vacant'
// (occupancy only): tracks recruitment-demand lifecycle.
import { createClient } from "@/lib/supabase/server";
import { openVacancy, updateVacancyStatus } from "@/lib/positions/vacancy-actions";

export default async function VacanciesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ data: vacancies }, { data: vacantPositions }, { data: requisitions }] = await Promise.all([
    supabase
      .from("vacancies")
      .select("id, status, opened_at, target_fill_date, filled_at, positions(title), requisitions(role)")
      .eq("org_id", appUser.org_id)
      .order("opened_at", { ascending: false }),
    supabase.from("positions").select("id, title").eq("org_id", appUser.org_id).eq("status", "vacant").eq("is_active", true),
    supabase.from("requisitions").select("id, role").eq("org_id", appUser.org_id).eq("status", "Open"),
  ]);

  const statusColor: Record<string, string> = {
    open: "bg-amber-100 text-amber-700",
    on_hold: "bg-slate-100 text-slate-600",
    filled: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Vacancies</h1>
        <p className="text-sm text-neutral-500 mt-1">Recruitment-demand tracking, separate from a position&apos;s current occupancy.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-2">Open a vacancy</h2>
        <form action={openVacancy} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <select name="position_id" required className="border border-neutral-200 rounded px-2 py-1.5">
            <option value="">Vacant position…</option>
            {(vacantPositions ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <select name="requisition_id" className="border border-neutral-200 rounded px-2 py-1.5">
            <option value="">Link to requisition (optional)…</option>
            {(requisitions ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.role}</option>
            ))}
          </select>
          <input name="target_fill_date" type="date" className="border border-neutral-200 rounded px-2 py-1.5" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Open vacancy</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Position</th>
              <th className="px-4 py-2 font-medium">Requisition</th>
              <th className="px-4 py-2 font-medium">Opened</th>
              <th className="px-4 py-2 font-medium">Target fill</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(vacancies ?? []).map((v) => {
              const pos = v.positions as unknown as { title: string } | null;
              const req = v.requisitions as unknown as { role: string } | null;
              return (
                <tr key={v.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-800">{pos?.title}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{req?.role ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{new Date(v.opened_at).toLocaleDateString("en-KE")}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{v.target_fill_date ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[v.status] ?? "bg-neutral-100"}`}>{v.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {v.status === "open" && (
                      <form action={updateVacancyStatus} className="inline-flex gap-1">
                        <input type="hidden" name="vacancy_id" value={v.id} />
                        <input type="hidden" name="status" value="on_hold" />
                        <button type="submit" className="text-xs text-neutral-500 hover:underline">Hold</button>
                      </form>
                    )}
                    {v.status !== "filled" && v.status !== "cancelled" && (
                      <form action={updateVacancyStatus} className="inline-flex gap-1 ml-2">
                        <input type="hidden" name="vacancy_id" value={v.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <button type="submit" className="text-xs text-red-500 hover:underline">Cancel</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(vacancies ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={6}>No vacancies yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
