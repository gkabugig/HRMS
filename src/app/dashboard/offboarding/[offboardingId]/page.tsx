import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  addAsset,
  toggleAssetReturned,
  updateExitInterview,
  updateFinalDues,
  updateRedundancyRecords,
  completeOffboarding,
} from "../actions";

export default async function OffboardingDetailPage({
  params,
}: {
  params: Promise<{ offboardingId: string }>;
}) {
  const { offboardingId } = await params;
  const supabase = await createClient();

  const [{ data: record }, { data: assets }] = await Promise.all([
    supabase
      .from("offboarding_records")
      .select("*, employees(name, staff_no)")
      .eq("id", offboardingId)
      .single(),
    supabase
      .from("offboarding_assets")
      .select("id, item, returned")
      .eq("offboarding_id", offboardingId)
      .order("item"),
  ]);

  if (!record) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Offboarding record not found.</p>;
  }

  const employeeName = (record.employees as unknown as { name: string; staff_no: string } | null)?.name ?? "—";
  const isCompleted = record.status === "Completed";
  const allAssetsReturned = (assets ?? []).every((a) => a.returned);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/offboarding" className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
          ← All offboarding
        </Link>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mt-1">{employeeName}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {record.exit_type} · Notice {record.notice_date} · Last working day {record.last_working_day} · Status{" "}
          {record.status}
          {record.paid_in_lieu_of_notice && " · Paid in lieu of notice"}
        </p>
        {isCompleted && (
          <Link
            href={`/dashboard/offboarding/${offboardingId}/certificate`}
            className="text-sm text-brand-600 hover:text-brand-700 hover:underline"
          >
            View certificate of service →
          </Link>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Asset return checklist</h2>
        <ul className="space-y-1 mb-3">
          {(assets ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <form action={toggleAssetReturned.bind(null, a.id, offboardingId, !a.returned)}>
                <button type="submit" className={a.returned ? "text-green-600" : "text-neutral-400 dark:text-neutral-500"}>
                  {a.returned ? "☑" : "☐"}
                </button>
              </form>
              <span className={a.returned ? "line-through text-neutral-400 dark:text-neutral-500" : ""}>{a.item}</span>
            </li>
          ))}
          {(!assets || assets.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">No assets tracked.</p>}
        </ul>
        {!isCompleted && (
          <form action={addAsset.bind(null, offboardingId)} className="flex gap-2 text-sm">
            <input name="item" placeholder="Add an item…" required className="flex-1 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1" />
            <button type="submit" className="text-xs bg-neutral-200 dark:bg-neutral-700 rounded px-3 py-1">
              Add
            </button>
          </form>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Exit interview</h2>
        {isCompleted ? (
          <div className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1">
            <p>Completed: {record.exit_interview_completed ? "Yes" : "No"}</p>
            <p className="whitespace-pre-wrap">{record.exit_interview_notes || "No notes."}</p>
          </div>
        ) : (
          <form action={updateExitInterview.bind(null, offboardingId)} className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="exit_interview_completed"
                defaultChecked={record.exit_interview_completed}
              />
              Exit interview completed
            </label>
            <textarea
              name="exit_interview_notes"
              defaultValue={record.exit_interview_notes ?? ""}
              rows={3}
              placeholder="Notes from the exit interview…"
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <button type="submit" className="text-xs bg-neutral-200 dark:bg-neutral-700 rounded px-3 py-1">
              Save
            </button>
          </form>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Final dues &amp; statutory deregistration</h2>
        {isCompleted ? (
          <div className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1">
            <p>Pro-rated days: {record.pro_rated_days}</p>
            <p>Other deductions: KES {Number(record.other_deductions).toLocaleString()}</p>
            <p>Statutory deregistered: {record.statutory_deregistered ? "Yes" : "No"}</p>
            {record.exit_type === "Redundancy" && (
              <p>Severance pay (s.40, 15 days/completed year): KES {Number(record.severance_pay).toLocaleString()}</p>
            )}
          </div>
        ) : (
          <form action={updateFinalDues.bind(null, offboardingId)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input
              name="pro_rated_days"
              type="number"
              defaultValue={record.pro_rated_days}
              placeholder="Pro-rated days"
              className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <input
              name="other_deductions"
              type="number"
              step="0.01"
              defaultValue={record.other_deductions}
              placeholder="Other deductions (KES)"
              className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="statutory_deregistered"
                defaultChecked={record.statutory_deregistered}
              />
              NSSF/SHIF deregistered
            </label>
            {record.exit_type === "Redundancy" && (
              <label className="text-xs text-neutral-500 dark:text-neutral-400 flex flex-col gap-1 sm:col-span-3">
                Severance pay (KES) — auto-calculated at 15 days/completed year, adjust if needed
                <input
                  name="severance_pay"
                  type="number"
                  step="0.01"
                  defaultValue={record.severance_pay}
                  className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
                />
              </label>
            )}
            <button type="submit" className="sm:col-span-3 text-xs bg-neutral-200 dark:bg-neutral-700 rounded px-3 py-1.5 w-fit">
              Save
            </button>
          </form>
        )}
      </div>

      {record.exit_type === "Redundancy" && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Redundancy notices (s.40)</h2>
          {isCompleted ? (
            <div className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1">
              <p>Labour office notified: {record.labour_office_notified_on || "Not recorded"}</p>
              <p>Union notified: {record.union_notified_on || "Not recorded"}</p>
              <p>Selection criteria: {record.selection_criteria || "Not recorded"}</p>
            </div>
          ) : (
            <form
              action={updateRedundancyRecords.bind(null, offboardingId)}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm"
            >
              <input
                name="labour_office_notified_on"
                type="date"
                defaultValue={record.labour_office_notified_on ?? ""}
                className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
              />
              <input
                name="union_notified_on"
                type="date"
                defaultValue={record.union_notified_on ?? ""}
                className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
              />
              <input
                name="selection_criteria"
                placeholder="Selection criteria used"
                defaultValue={record.selection_criteria ?? ""}
                className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
              />
              <button type="submit" className="sm:col-span-3 text-xs bg-neutral-200 dark:bg-neutral-700 rounded px-3 py-1.5 w-fit">
                Save
              </button>
            </form>
          )}
        </div>
      )}

      {!isCompleted && (
        <form action={completeOffboarding.bind(null, offboardingId, record.employee_id)}>
          <button
            type="submit"
            disabled={!allAssetsReturned}
            className="bg-red-700 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Complete offboarding &amp; mark employee terminated
          </button>
          {!allAssetsReturned && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">All assets must be marked returned first.</p>
          )}
        </form>
      )}
    </div>
  );
}
