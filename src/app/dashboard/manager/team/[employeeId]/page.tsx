// Area 06 §7 "Team Employee 360 – Manager View" — renders getManagerEmployee360(),
// the deliberately narrower authorization projection (see that file's own
// comment for why it's not a redaction wrapper around the HR Employee 360).
// Scope is explicitly re-checked here against getManagerScope() before the
// 360 is even fetched — belt and suspenders alongside the RLS that backs
// every query inside getManagerEmployee360 itself.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getManagerEmployee360 } from "@/lib/manager/get-manager-employee-360";
import { submitManagerCheckIn } from "@/lib/manager/manager-checkin-actions";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function ManagerEmployee360Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);

  if (!scope.employeeIds.includes(employeeId)) notFound();

  const data = await getManagerEmployee360(supabase, employeeId, ctx.orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">{data.employee.name}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {data.employee.jobTitle} · {data.employee.department} · {data.employee.employmentType} · since {data.startDate}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Attendance (last {data.attendance.windowDays} days)</h2>
          <p className="text-sm text-neutral-700">
            Present {data.attendance.daysPresent} days · Late {data.attendance.lateDays} times
          </p>
          {data.attendance.exceptions.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-neutral-500">
              {data.attendance.exceptions.map((e, i) => (
                <li key={i}>{e.workDate} — {e.type.replace(/_/g, " ")}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Leave</h2>
          {data.leave.balances.length === 0 ? (
            <EmptyState message="No leave balances on file." />
          ) : (
            <ul className="space-y-1 text-sm text-neutral-700">
              {data.leave.balances.map((b, i) => (
                <li key={i} className="flex justify-between">
                  <span>{b.leaveType}</span>
                  <span className="font-mono">{b.remaining}/{b.entitlement} days</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Performance</h2>
          {data.performance.appraisals.length === 0 ? (
            <EmptyState message="No appraisals on file." />
          ) : (
            <ul className="space-y-1 text-sm text-neutral-700 mb-3">
              {data.performance.appraisals.map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>{a.cycle} — {a.status}</span>
                  {a.finalScore !== null && <span className="font-mono">{a.finalScore}</span>}
                </li>
              ))}
            </ul>
          )}
          <h3 className="text-xs font-semibold text-neutral-700 mt-4 mb-2">Check-ins</h3>
          {data.performance.checkIns.length === 0 ? (
            <p className="text-xs text-neutral-400 mb-3">No check-ins recorded yet.</p>
          ) : (
            <ul className="space-y-2 mb-3">
              {data.performance.checkIns.map((c) => (
                <li key={c.id} className="text-xs border-l-2 border-neutral-200 pl-2">
                  <p className="text-neutral-400">{new Date(c.createdAt).toLocaleDateString("en-KE")}</p>
                  <p className="text-neutral-700">{c.notes}</p>
                  {c.agreedActions && <p className="text-neutral-500 italic">Agreed: {c.agreedActions}</p>}
                </li>
              ))}
            </ul>
          )}
          <form action={submitManagerCheckIn.bind(null, employeeId)} className="space-y-2">
            <textarea name="notes" placeholder="Check-in notes" required rows={2} className="w-full border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm" />
            <input name="agreed_actions" placeholder="Agreed actions (optional)" className="w-full border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm" />
            <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 text-sm font-medium">
              Log check-in
            </button>
          </form>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Learning</h2>
          {data.learning.overdueMandatory.length > 0 && (
            <p className="text-sm text-red-600 mb-2">{data.learning.overdueMandatory.length} mandatory course(s) overdue</p>
          )}
          {data.learning.enrollments.length === 0 ? (
            <EmptyState message="No training enrollments on file." />
          ) : (
            <ul className="space-y-1 text-sm text-neutral-700">
              {data.learning.enrollments.map((e) => (
                <li key={e.id} className="flex justify-between">
                  <span>{e.courseName}</span>
                  <span className="text-xs text-neutral-500">{e.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Documents shared with you</h2>
          {data.documents.length === 0 ? (
            <EmptyState message="No documents visible to you." />
          ) : (
            <ul className="space-y-1 text-sm text-neutral-700">
              {data.documents.map((d) => (
                <li key={d.id} className="flex justify-between">
                  <span>{d.title || d.fileName}</span>
                  <span className="text-xs text-neutral-500">{d.docType}{d.expiryDate ? ` · expires ${d.expiryDate}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Open requests</h2>
          {data.openRequests.length === 0 ? (
            <EmptyState message="No open service requests." />
          ) : (
            <ul className="space-y-1 text-sm text-neutral-700">
              {data.openRequests.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.subject}</span>
                  <span className="text-xs text-neutral-500">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
