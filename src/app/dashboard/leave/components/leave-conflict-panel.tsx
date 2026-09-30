import type { LeaveConflict } from "@/lib/leave/leave-types";

const LABELS: Record<LeaveConflict["type"], string> = {
  team_overlap: "Team overlap",
  critical_role_overlap: "Manager also away",
  minimum_staffing: "Below minimum staffing",
  insufficient_balance: "Insufficient balance",
  holiday_overlap: "Includes a public holiday",
  pending_overlap: "Overlaps another request",
};

export function LeaveConflictPanel({ conflicts }: { conflicts: LeaveConflict[] }) {
  if (conflicts.length === 0) {
    return <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">✓ No conflicts detected.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {conflicts.map((c, i) => (
        <li
          key={i}
          className={`text-xs rounded-lg px-3 py-2 border ${
            c.severity === "critical" ? "bg-red-50 text-red-700 border-red-100" : "bg-amber-50 text-amber-700 border-amber-100"
          }`}
        >
          <span className="font-semibold">{c.severity === "critical" ? "⚠" : "△"} {LABELS[c.type]}:</span> {c.message}
        </li>
      ))}
    </ul>
  );
}
