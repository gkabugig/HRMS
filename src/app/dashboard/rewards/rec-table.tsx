import Link from "next/link";
import { StatusChip, kes } from "./ui";

export type RecRow = {
  id: string;
  employee_id: string;
  reward_type: string;
  calculated_amount: number;
  recommended_amount: number;
  current_salary: number | null;
  new_salary: number | null;
  pct: number | null;
  status: string;
  is_exception: boolean;
  snapshot: { employeeName?: string; department?: string; rating?: string | null; scorePct?: number | null; eligibility?: { result?: string; reasons?: string[] } } | null;
};

const TYPE_LABEL: Record<string, string> = { merit: "Merit", bonus: "Bonus", incentive: "Incentive", spot: "Spot award", retention: "Retention", referral: "Referral", long_service: "Long service" };

export default function RecTable({ rows }: { rows: RecRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-500 dark:text-neutral-400 border-b border-[var(--border-subtle)]">
            <th className="py-2 pr-3 font-medium">Employee</th>
            <th className="py-2 pr-3 font-medium">Reward</th>
            <th className="py-2 pr-3 font-medium">Rating</th>
            <th className="py-2 pr-3 font-medium text-right">Calculated</th>
            <th className="py-2 pr-3 font-medium text-right">Recommended</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const excluded = r.snapshot?.eligibility?.result === "excluded";
            const isMerit = r.reward_type === "merit";
            return (
              <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0 align-top">
                <td className="py-2.5 pr-3">
                  <Link href={`/dashboard/rewards/recommendations/${r.id}`} className="font-medium text-neutral-900 dark:text-neutral-50 hover:text-brand-600">
                    {r.snapshot?.employeeName ?? "Employee"}
                  </Link>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">{r.snapshot?.department}</span>
                </td>
                <td className="py-2.5 pr-3 text-neutral-700 dark:text-neutral-200">{TYPE_LABEL[r.reward_type] ?? r.reward_type}</td>
                <td className="py-2.5 pr-3 text-neutral-700 dark:text-neutral-200">
                  {r.snapshot?.rating ?? "—"}
                  {r.snapshot?.scorePct != null && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{r.snapshot.scorePct}%</span>}
                </td>
                {excluded ? (
                  <td colSpan={2} className="py-2.5 pr-3 text-xs text-neutral-500 dark:text-neutral-400">
                    Not eligible: {r.snapshot?.eligibility?.reasons?.[0] ?? "see the record"}
                  </td>
                ) : (
                  <>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{isMerit ? `${r.pct ?? 0}% → ${kes(r.new_salary)}` : kes(r.calculated_amount)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-medium">{isMerit ? kes(Number(r.recommended_amount) / 12) + "/mo" : kes(r.recommended_amount)}</td>
                  </>
                )}
                <td className="py-2.5">
                  <StatusChip status={excluded ? "Draft" : r.status} />
                  {r.is_exception && <span className="ml-1.5 text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">Exception</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
