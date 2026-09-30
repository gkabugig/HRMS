import type { LeaveRequestRow } from "@/lib/leave/leave-types";
import { leaveStyle } from "@/lib/leave/leave-legend";

// Visual workforce availability grid (spec §3 mock). One row per employee
// in scope, one column per day of the visible month — approved leave is a
// solid chip, pending a hatched/outlined one, so the two are distinguishable
// without relying on colour alone (each chip also carries the leave-type
// short code as a text label).
export function LeaveCalendar({
  employees,
  requests,
  month,
  holidayDates,
}: {
  employees: { id: string; name: string }[];
  requests: LeaveRequestRow[];
  month: string; // YYYY-MM
  holidayDates: Set<string>;
}) {
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const byEmployee = new Map<string, LeaveRequestRow[]>();
  for (const r of requests) {
    if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
    byEmployee.get(r.employee_id)!.push(r);
  }

  function requestFor(employeeId: string, day: number): LeaveRequestRow | undefined {
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    return (byEmployee.get(employeeId) ?? []).find((r) => r.start_date <= iso && r.end_date >= iso);
  }

  if (employees.length === 0) {
    return <p className="text-sm text-neutral-400 py-8 text-center">No employees in scope for this view.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 bg-[var(--surface)] text-left px-2 py-1.5 text-neutral-500 font-medium min-w-[140px]">
              Employee
            </th>
            {days.map((d) => {
              const iso = `${month}-${String(d).padStart(2, "0")}`;
              const dow = new Date(year, m - 1, d).getDay();
              const weekend = dow === 0 || dow === 6;
              const holiday = holidayDates.has(iso);
              return (
                <th
                  key={d}
                  className={`px-1 py-1.5 font-medium text-center w-7 ${weekend || holiday ? "text-neutral-300" : "text-neutral-500"}`}
                  title={holiday ? "Public holiday" : weekend ? "Weekend" : undefined}
                >
                  {d}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-t border-neutral-50">
              <td className="sticky left-0 bg-[var(--surface)] px-2 py-1.5 text-neutral-800 font-medium whitespace-nowrap">
                {e.name}
              </td>
              {days.map((d) => {
                const req = requestFor(e.id, d);
                if (!req) return <td key={d} className="w-7 h-7" />;
                const style = leaveStyle(req.leave_type);
                return (
                  <td key={d} className="w-7 h-7 px-0.5 py-0.5">
                    <span
                      title={`${req.leave_type} (${req.status})`}
                      className={`flex items-center justify-center h-6 rounded text-[9px] font-semibold ${style.bg} ${style.text} ${
                        req.status === "Pending" ? "opacity-50" : ""
                      }`}
                    >
                      {style.code}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeaveLegend() {
  const entries = Object.entries({
    Annual: "Annual",
    Sick: "Sick",
    Maternity: "Maternity",
    Paternity: "Paternity",
    Unpaid: "Unpaid",
    Study: "Study",
    Compassionate: "Compassionate",
  });
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-500">
      {entries.map(([type, label]) => {
        const style = leaveStyle(type);
        return (
          <span key={type} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded ${style.bg}`} />
            {label}
          </span>
        );
      })}
      <span className="flex items-center gap-1.5 opacity-60">
        <span className="h-3 w-3 rounded bg-neutral-400 opacity-50" />
        Pending
      </span>
    </div>
  );
}
