import Link from "next/link";
import type { PayrollRegisterRow } from "@/lib/payroll/command-centre-types";

function money(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-KE", { maximumFractionDigits: 0 });
}

export default function PayrollRegister({
  runId,
  rows,
  total,
  page,
  pageSize,
  departments,
  filters,
  canSeeSalary,
}: {
  runId: string;
  rows: PayrollRegisterRow[];
  total: number;
  page: number;
  pageSize: number;
  departments: string[];
  filters: { search?: string; department?: string; status?: string };
  canSeeSalary: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...filters, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    return `?${params.toString()}`;
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Employee Payroll Register</h2>
        <span className="text-xs text-neutral-400">{total} employees</span>
      </div>
      <form method="get" className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)] text-xs">
        <input
          name="search"
          defaultValue={filters.search}
          placeholder="Search name or staff no…"
          className="border border-neutral-300 rounded-lg px-2.5 py-1.5 flex-1 min-w-[160px]"
        />
        <select name="department" defaultValue={filters.department ?? ""} className="border border-neutral-300 rounded-lg px-2 py-1.5">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={filters.status ?? ""} className="border border-neutral-300 rounded-lg px-2 py-1.5">
          <option value="">All statuses</option>
          <option value="Ready">Ready</option>
          <option value="Exception">Exception</option>
        </select>
        <button type="submit" className="bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg px-3 py-1.5 font-medium">
          Filter
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium text-right">Basic</th>
              <th className="px-4 py-2 font-medium text-right">Allowances</th>
              <th className="px-4 py-2 font-medium text-right">Gross</th>
              {canSeeSalary && <th className="px-4 py-2 font-medium text-right">PAYE</th>}
              {canSeeSalary && <th className="px-4 py-2 font-medium text-right">NSSF</th>}
              {canSeeSalary && <th className="px-4 py-2 font-medium text-right">SHIF</th>}
              {canSeeSalary && <th className="px-4 py-2 font-medium text-right">Housing</th>}
              <th className="px-4 py-2 font-medium text-right">Net</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/payroll/${runId}/employee/${r.id}`} className="text-neutral-900 hover:text-brand-700 font-medium">
                    {r.name}
                  </Link>
                  <div className="text-xs text-neutral-400">{r.staffNo}</div>
                </td>
                <td className="px-4 py-2 text-neutral-600">{r.department}</td>
                <td className="px-4 py-2 text-right font-mono">{money(r.basic)}</td>
                <td className="px-4 py-2 text-right font-mono">{money(r.allowances)}</td>
                <td className="px-4 py-2 text-right font-mono">{money(r.gross)}</td>
                {canSeeSalary && <td className="px-4 py-2 text-right font-mono">{money(r.paye)}</td>}
                {canSeeSalary && <td className="px-4 py-2 text-right font-mono">{money(r.nssf)}</td>}
                {canSeeSalary && <td className="px-4 py-2 text-right font-mono">{money(r.shif)}</td>}
                {canSeeSalary && <td className="px-4 py-2 text-right font-mono">{money(r.housingLevy)}</td>}
                <td className="px-4 py-2 text-right font-mono font-semibold">{money(r.netAdjusted)}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "Ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {r.status === "Ready" ? "✓ Ready" : "⚠ Exception"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canSeeSalary ? 10 : 6} className="px-4 py-6 text-center text-neutral-400">
                  No employees match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)] text-xs text-neutral-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ page: page - 1 })} className="text-brand-600 hover:text-brand-700 font-medium">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ page: page + 1 })} className="text-brand-600 hover:text-brand-700 font-medium">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
