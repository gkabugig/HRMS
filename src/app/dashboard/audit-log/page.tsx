import { createClient } from "@/lib/supabase/server";

export default async function AuditLogPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("employee_audit_log")
    .select("changed_at, field, old_value, new_value, employees(name, staff_no)")
    .order("changed_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Audit Log</h1>
        <p className="text-sm text-neutral-500">
          Every field change made to an employee record, most recent first. Read-only —
          nothing here can be edited or deleted.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Field</th>
              <th className="px-4 py-2 font-medium">From</th>
              <th className="px-4 py-2 font-medium">To</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r, i) => {
              const emp = r.employees as unknown as { name: string; staff_no: string } | null;
              return (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">
                    {new Date(r.changed_at).toLocaleString("en-KE")}
                  </td>
                  <td className="px-4 py-2">
                    {emp ? `${emp.name} (${emp.staff_no})` : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.field}</td>
                  <td className="px-4 py-2 text-neutral-500">{r.old_value ?? "—"}</td>
                  <td className="px-4 py-2 font-medium">{r.new_value ?? "—"}</td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  No changes recorded yet. Edits made from the Employees page will show up here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
