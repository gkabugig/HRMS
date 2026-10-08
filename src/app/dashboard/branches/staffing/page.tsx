import Link from "next/link";
import ActionForm from "@/components/forms/action-form";
import { BTN, BTN_DANGER, Chip, Empty, INPUT, LABEL, PageTitle, Panel } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { addStaffingRule, removeStaffingRule } from "@/lib/hub/staffing-actions";
import { staffingShortfalls, type Rule } from "@/lib/hub/staffing";

export default async function StaffingPage() {
  const { supabase, orgId, role } = await pageCtx();
  const isHr = role === "admin" || role === "hr";
  const [{ data: branches }, { data: rules }, { data: staff }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("org_id", orgId).order("name"),
    supabase.from("branch_staffing_rules").select("id, branch_id, job_title, min_count").eq("org_id", orgId).order("job_title"),
    supabase.from("employees").select("branch_id, job_title").eq("org_id", orgId).eq("status", "Active"),
  ]);
  const list = (branches ?? []) as { id: string; name: string }[];
  const rl = (rules ?? []) as Rule[];
  const shortfalls = staffingShortfalls(list.map((b) => b.id), rl, (staff ?? []) as { branch_id: string | null; job_title: string }[]);
  const nameOf = (id: string | null) => (id ? list.find((b) => b.id === id)?.name ?? "A branch" : "Every branch");

  return (
    <div className="space-y-6">
      <PageTitle title="Branch staffing" subtitle="Minimum people each branch must have, and where it falls short.">
        <Link href="/dashboard/branches" className="text-xs text-brand-600 underline">← Back to branches</Link>
      </PageTitle>

      <Panel title={`Shortfalls (${shortfalls.length})`} subtitle="Counts active employees whose job title contains the rule's title.">
        {rl.length === 0 ? (
          <Empty>No staffing rules yet.{isHr ? " Add one below." : ""}</Empty>
        ) : shortfalls.length === 0 ? (
          <p className="text-sm text-emerald-700 py-3">Every branch meets its staffing rules.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 dark:text-neutral-400 border-b border-[var(--border-subtle)]">
                <th className="py-2 pr-3 font-medium">Branch</th><th className="py-2 pr-3 font-medium">Role</th><th className="py-2 pr-3 font-medium">Needed</th><th className="py-2 pr-3 font-medium">Have</th><th className="py-2 font-medium">Missing</th>
              </tr>
            </thead>
            <tbody>
              {shortfalls.map((s) => (
                <tr key={`${s.branchId}-${s.ruleId}`} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className="py-2.5 pr-3">{nameOf(s.branchId)}</td><td className="py-2.5 pr-3">{s.jobTitle}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{s.required}</td><td className="py-2.5 pr-3 tabular-nums">{s.actual}</td>
                  <td className="py-2.5"><Chip tone="red">{s.missing} short</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Rules">
        {rl.length === 0 ? <Empty>None.</Empty> : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {rl.map((r) => (
              <li key={r.id} className="py-2.5 flex items-center justify-between text-sm">
                <span>At least <strong>{r.min_count}</strong> × {r.job_title} <span className="text-neutral-400">· {nameOf(r.branch_id)}</span></span>
                {isHr && (
                  <ActionForm action={removeStaffingRule.bind(null, r.id)} successMessage={null} resetOnSuccess={false}><button className={BTN_DANGER}>Remove</button></ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {isHr && (
          <ActionForm action={addStaffingRule} successMessage="Rule added." className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end mt-4">
            <div><label className={LABEL}>Job title</label><input name="job_title" required className={INPUT} placeholder="Optometrist" /></div>
            <div><label className={LABEL}>At least</label><input name="min_count" type="number" min="1" required className={INPUT} /></div>
            <div><label className={LABEL}>Applies to</label><select name="branch_id" className={INPUT}><option value="">Every branch</option>{list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div><button className={BTN}>Add rule</button></div>
          </ActionForm>
        )}
      </Panel>
    </div>
  );
}
