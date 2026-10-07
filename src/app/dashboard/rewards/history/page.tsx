import { getRewardContext } from "@/lib/rewards/context";
import { Empty, PageHead, Panel, StatusChip, kes } from "../ui";

export default async function HistoryPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (!["admin", "hr", "manager"].includes(role)) return <Empty>Your own rewards are under My Rewards.</Empty>;
  const { data } = await supabase.from("reward_transactions").select("id, tx_type, amount, new_salary, effective_date, payroll_period, payroll_status, employee_id, recommendation_id, employees(name, staff_no)").eq("org_id", orgId).order("created_at", { ascending: false }).limit(300);
  return (
    <div className="space-y-6">
      <PageHead title="Reward history" subtitle="Everything approved and sent to payroll or the pay record." role={role} current="/dashboard/rewards/history" />
      <Panel>
        {(data ?? []).length === 0 ? (
          <Empty>Nothing has been approved yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 dark:text-neutral-400 border-b border-[var(--border-subtle)]">
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Outcome</th>
                <th className="py-2 pr-3 font-medium">Effective</th>
                <th className="py-2 pr-3 font-medium">Pay period</th>
                <th className="py-2 font-medium">Payroll</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((t) => {
                const emp = t.employees as unknown as { name: string; staff_no: string } | null;
                return (
                  <tr key={t.id as string} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <td className="py-2.5 pr-3 text-neutral-900 dark:text-neutral-50">{emp?.name ?? "—"} <span className="text-xs text-neutral-500 dark:text-neutral-400">{emp?.staff_no}</span></td>
                    <td className="py-2.5 pr-3 tabular-nums">{t.tx_type === "salary_change" ? `Salary → ${kes(t.new_salary)}` : kes(t.amount)}</td>
                    <td className="py-2.5 pr-3 text-neutral-600 dark:text-neutral-300">{t.effective_date as string}</td>
                    <td className="py-2.5 pr-3 text-neutral-600 dark:text-neutral-300">{(t.payroll_period as string) ?? "—"}</td>
                    <td className="py-2.5"><StatusChip status={t.tx_type === "salary_change" ? "Finalised" : t.payroll_status === "paid" ? "Paid" : t.payroll_status === "included" ? "Approved" : "Open"} /> <span className="text-xs text-neutral-500 dark:text-neutral-400">{t.tx_type === "salary_change" ? "applied" : t.payroll_status as string}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
