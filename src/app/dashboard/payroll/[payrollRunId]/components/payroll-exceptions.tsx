import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { PayrollExceptionRow } from "@/lib/payroll/command-centre-types";
import { resolveException, waiveException } from "../actions";

const DOT = { critical: "bg-red-500", warning: "bg-amber-500", info: "bg-brand-500" };

export default function PayrollExceptions({
  runId,
  exceptions,
  canManage,
  locked,
}: {
  runId: string;
  exceptions: PayrollExceptionRow[];
  canManage: boolean;
  locked: boolean;
}) {
  const open = exceptions.filter((e) => e.status === "open");
  const resolved = exceptions.filter((e) => e.status !== "open");

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Exceptions</h2>
        {open.length > 0 && <span className="text-xs text-neutral-500">{open.length} open</span>}
      </div>
      <div className="flex-1 overflow-y-auto max-h-[420px] divide-y divide-neutral-50">
        {open.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <CheckCircle2 size={28} className="text-emerald-500 mb-2" strokeWidth={1.5} />
            <p className="text-sm text-neutral-500">No open exceptions.</p>
          </div>
        ) : (
          open.map((e) => (
            <details key={e.id} className="group px-4 py-3">
              <summary className="flex items-start gap-3 cursor-pointer list-none">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${DOT[e.severity]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-900">{e.message}</div>
                  {e.employeeId && (
                    <Link href={`/dashboard/payroll/${runId}/employee/${e.employeeId}`} className="text-xs text-brand-600 hover:underline">
                      View employee
                    </Link>
                  )}
                </div>
              </summary>
              {canManage && !locked && (
                <div className="mt-3 ml-5 space-y-2">
                  <form action={resolveException} className="flex items-center gap-2">
                    <input type="hidden" name="run_id" value={runId} />
                    <input type="hidden" name="exception_id" value={e.id} />
                    <input name="note" placeholder="Resolution note (optional)" className="flex-1 text-xs border border-neutral-300 rounded-lg px-2 py-1.5" />
                    <button type="submit" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 font-medium">
                      Resolve
                    </button>
                  </form>
                  <form action={waiveException} className="flex items-center gap-2">
                    <input type="hidden" name="run_id" value={runId} />
                    <input type="hidden" name="exception_id" value={e.id} />
                    <input name="reason" placeholder="Reason (required to waive)" required className="flex-1 text-xs border border-neutral-300 rounded-lg px-2 py-1.5" />
                    <button type="submit" className="text-xs border border-neutral-300 hover:border-neutral-400 text-neutral-700 rounded-lg px-3 py-1.5 font-medium">
                      Waive
                    </button>
                  </form>
                </div>
              )}
            </details>
          ))
        )}
        {resolved.length > 0 && (
          <details className="px-4 py-3">
            <summary className="text-xs text-neutral-400 cursor-pointer">{resolved.length} resolved/waived</summary>
            <ul className="mt-2 space-y-1.5">
              {resolved.map((e) => (
                <li key={e.id} className="text-xs text-neutral-500">
                  <span className={e.status === "waived" ? "text-amber-600" : "text-emerald-600"}>{e.status}</span> — {e.message}
                  {e.resolutionNote && <span className="text-neutral-400"> ({e.resolutionNote})</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
