// Employee view: only the signed-in employee's own approved outcomes.
// (RLS: reward_recommendations_self_read / reward_tx_self_read.)
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import EmptyState from "@/components/employee-portal/empty-state";
import { Panel, StatusChip, kes } from "../../rewards/ui";

export default async function MyRewardsPage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);
  const { data } = await supabase
    .from("reward_transactions")
    .select("id, tx_type, amount, new_salary, effective_date, payroll_period, payroll_status")
    .eq("employee_id", ctx.employeeId)
    .order("effective_date", { ascending: false });
  const { data: promo } = await supabase
    .from("promotion_cases")
    .select("id, proposed_title, effective_date, letter_text")
    .eq("employee_id", ctx.employeeId)
    .eq("status", "Finalised")
    .order("effective_date", { ascending: false });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">My Rewards</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Approved bonuses, awards and salary changes. Anything still being decided is not shown here.</p>
      </div>
      <Panel>
        {(data ?? []).length === 0 ? (
          <EmptyState message="No approved rewards yet." />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(data ?? []).map((t) => (
              <li key={t.id as string} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t.tx_type === "salary_change" ? `Salary increase to ${kes(t.new_salary)} a month` : `${kes(t.amount)} one-off payment`}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Effective {t.effective_date as string}
                    {t.payroll_period ? ` · pay period ${t.payroll_period as string}` : ""}
                  </p>
                </div>
                <StatusChip status={t.tx_type === "salary_change" ? "Finalised" : t.payroll_status === "paid" ? "Paid" : "Approved"} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {(promo ?? []).map((p) => (
        <Panel key={p.id as string} title={`Promotion to ${p.proposed_title as string}`} subtitle={`Effective ${p.effective_date as string}`}>
          <pre className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100 font-sans">{p.letter_text as string}</pre>
        </Panel>
      ))}
    </div>
  );
}
