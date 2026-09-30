import type { Employee360 } from "@/lib/employees/get-employee-360";
import { addAsset, updateAssetStatus } from "../actions";

const STATUS_STYLES: Record<string, string> = {
  Assigned: "bg-emerald-100 text-emerald-700",
  Returned: "bg-neutral-200 text-neutral-600",
  Lost: "bg-red-100 text-red-700",
  Damaged: "bg-amber-100 text-amber-700",
};

export function AssetsTab({ data, employeeId, canManage }: { data: Employee360; employeeId: string; canManage: boolean }) {
  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Asset</th>
              <th className="px-4 py-2 font-medium">Tag / Serial</th>
              <th className="px-4 py-2 font-medium">Issued</th>
              <th className="px-4 py-2 font-medium">Status</th>
              {canManage && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {data.assets.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{a.asset_type}</td>
                <td className="px-4 py-2 text-neutral-500">
                  {[a.asset_tag, a.serial_no].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-4 py-2">{a.issued_on}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[a.status] ?? ""}`}>{a.status}</span>
                </td>
                {canManage && (
                  <td className="px-4 py-2">
                    {a.status === "Assigned" && (
                      <form action={updateAssetStatus.bind(null, a.id, employeeId)} className="inline-flex gap-1">
                        <input type="hidden" name="status" value="Returned" />
                        <button type="submit" className="text-xs text-brand-600 hover:underline">
                          Mark returned
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {data.assets.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="px-4 py-6 text-center text-neutral-400">
                  No assets assigned.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Assign an asset</h2>
          <form action={addAsset.bind(null, employeeId)} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <input name="asset_type" placeholder="Asset (e.g. Laptop)" required className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <input name="asset_tag" placeholder="Asset tag" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <input name="serial_no" placeholder="Serial number" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <input name="issued_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <button type="submit" className="sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
              Assign asset
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
