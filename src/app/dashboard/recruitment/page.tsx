import ActionForm from "@/components/forms/action-form";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createRequisition, closeRequisition, decideRequisition } from "./actions";

const input = "border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2";
const card = "bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03]";

const APPROVAL_STYLE: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

export default async function RecruitmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id, org_id")
    .eq("id", user!.id)
    .maybeSingle();

  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";
  const isManager = appUser?.role === "manager";

  const [{ data: requisitions }, { data: employees }] = await Promise.all([
    supabase
      .from("requisitions")
      .select("id, role, department, headcount, status, approval_status, approval_note, published, closing_date, raised_on, employees(name), candidates(count)")
      .order("raised_on", { ascending: false }),
    isHrLike
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  const pending = (requisitions ?? []).filter((r) => r.approval_status === "Pending");
  const careersPath = appUser?.org_id ? `/careers/${appUser.org_id}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Recruitment</h1>
        <div className="flex items-center gap-3 text-sm">
          {isHrLike && (
            <Link href="/dashboard/recruitment/reports" className="text-brand-600 hover:text-brand-700 hover:underline">
              Reports
            </Link>
          )}
          {isHrLike && careersPath && (
            <Link href={careersPath} target="_blank" className="text-brand-600 hover:text-brand-700 hover:underline">
              Public careers page ↗
            </Link>
          )}
        </div>
      </div>

      {isHrLike && pending.length > 0 && (
        <div className={`${card} p-4 border-amber-200`}>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Hiring requests waiting for approval</h2>
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="text-sm">
                <p>
                  <span className="font-medium">{r.role}</span> · {r.department} · headcount {r.headcount}
                  <span className="text-neutral-500 dark:text-neutral-400"> — requested by {(r.employees as unknown as { name: string } | null)?.name ?? "a manager"}</span>
                </p>
                <div className="flex flex-wrap gap-3 mt-1">
                  <ActionForm action={decideRequisition.bind(null, r.id, "Approved")} className="flex gap-2 items-center" successMessage={null}>
                    <input name="note" placeholder="Note (optional)" className={`${input} py-1 text-xs`} />
                    <button className="text-xs bg-green-700 hover:bg-green-800 text-white rounded-lg px-3 py-1">Approve</button>
                  </ActionForm>
                  <ActionForm action={decideRequisition.bind(null, r.id, "Rejected")} className="flex gap-2 items-center" successMessage={null}>
                    <input name="note" placeholder="Reason for declining" required className={`${input} py-1 text-xs`} />
                    <button className="text-xs bg-neutral-200 dark:bg-neutral-700 rounded-lg px-3 py-1">Decline</button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Headcount</th>
              <th className="px-4 py-2 font-medium">Candidates</th>
              <th className="px-4 py-2 font-medium">Hiring Manager</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(requisitions ?? []).map((r) => {
              const count = (r.candidates as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
              return (
                <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/recruitment/${r.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                      {r.role}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.department}</td>
                  <td className="px-4 py-2">{r.headcount}</td>
                  <td className="px-4 py-2">{count}</td>
                  <td className="px-4 py-2">{(r.employees as unknown as { name: string } | null)?.name ?? "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {r.approval_status !== "Approved" ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${APPROVAL_STYLE[r.approval_status]}`} title={r.approval_note ?? undefined}>
                        {r.approval_status === "Pending" ? "Awaiting approval" : "Declined"}
                      </span>
                    ) : (
                      <>
                        {r.status}
                        {r.status === "Open" && r.published && (
                          <span className="ml-1.5 text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-neutral-800 dark:text-brand-300">On careers page</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {r.status === "Open" && r.approval_status === "Approved" && isHrLike && (
                      <ActionForm action={closeRequisition.bind(null, r.id)} successMessage={null}>
                        <button className="text-xs text-neutral-500 dark:text-neutral-400 underline">Close</button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!requisitions || requisitions.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                  No requisitions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(isHrLike || isManager) && (
        <div className={`${card} p-4`}>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-1">
            {isManager ? "Request a new hire" : "Raise a requisition"}
          </h2>
          {isManager && <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">HR will review your request before recruiting starts.</p>}
          <ActionForm action={createRequisition} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm mt-2">
            <input name="role" placeholder="Role / Job title" required className={input} />
            <input name="department" placeholder="Department" required className={input} />
            <input name="headcount" type="number" min={1} defaultValue={1} className={input} aria-label="Headcount" />
            {isHrLike ? (
              <select name="hiring_manager_id" className={input}>
                <option value="">Hiring manager (optional)</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : (
              <div />
            )}
            <input name="location" placeholder="Location (e.g. Nairobi)" className={input} />
            <select name="employment_type" className={input} aria-label="Employment type">
              {["Permanent", "Contract", "Casual", "Intern"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <label className="sm:col-span-2 flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
              <span className="text-xs whitespace-nowrap">Applications close</span>
              <input name="closing_date" type="date" className={`${input} flex-1`} />
            </label>
            <textarea name="description" rows={3} placeholder="Job description — what the person will do" className={`${input} sm:col-span-4`} />
            <textarea name="requirements" rows={3} placeholder="Requirements — qualifications and experience" className={`${input} sm:col-span-4`} />
            <button type="submit" className="sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              {isManager ? "Send request to HR" : "Raise requisition"}
            </button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
