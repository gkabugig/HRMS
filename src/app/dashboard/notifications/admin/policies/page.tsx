// Area 09 §23 "Event-to-policy mapping" — the live notification_policy_rules
// rows (seeded by migration 0088, editable here) that policy.ts's
// resolvePolicy() reads at processing time.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updatePolicyRule } from "@/lib/notifications/admin-actions";

const CHANNELS = ["in_app", "email", "sms", "push", "whatsapp"];
const PRIORITIES = ["critical", "action_required", "reminder", "information"];

export default async function NotificationPoliciesPage() {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("notification_policy_rules")
    .select("id, event_type, category, priority, mandatory, allowed_channels, quiet_hours_allowed, max_per_hour, is_active")
    .order("category")
    .order("event_type");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Event → Policy Mapping</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Mandatory events bypass the recipient&apos;s own opt-out. Changing this is a compliance decision — every save is audited.
          </p>
        </div>
        <Link href="/dashboard/notifications/admin" className="text-xs font-medium text-brand-600 hover:underline">← Admin Centre</Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Priority</th>
              <th className="px-4 py-2 font-medium">Mandatory</th>
              <th className="px-4 py-2 font-medium">Channels</th>
              <th className="px-4 py-2 font-medium">Quiet hrs OK</th>
              <th className="px-4 py-2 font-medium">Max/hr</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(rules ?? []).map((r) => {
              const formId = `policy-${r.id}`;
              return (
                <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800 align-top">
                  {/* A <form> can't be a direct child of <tr> per HTML table content
                      rules — the form element lives outside the row, and every
                      field associates with it via the `form` attribute instead. */}
                  <td className="px-4 py-2 text-neutral-900 dark:text-neutral-50 text-xs font-mono">
                    <form id={formId} action={updatePolicyRule}>
                      <input type="hidden" name="id" value={r.id} />
                    </form>
                    {r.event_type}
                  </td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 text-xs">{r.category}</td>
                  <td className="px-4 py-2">
                    <select form={formId} name="priority" defaultValue={r.priority} className="border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-1 text-xs">
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input form={formId} type="checkbox" name="mandatory" defaultChecked={r.mandatory} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {CHANNELS.map((c) => (
                        <label key={c} className="flex items-center gap-1">
                          <input form={formId} type="checkbox" name="allowed_channels" value={c} defaultChecked={r.allowed_channels?.includes(c)} />
                          {c}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input form={formId} type="checkbox" name="quiet_hours_allowed" defaultChecked={r.quiet_hours_allowed} />
                  </td>
                  <td className="px-4 py-2">
                    <input form={formId} type="number" name="max_per_hour" defaultValue={r.max_per_hour ?? ""} className="border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-1 w-16 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <button form={formId} type="submit" className="text-xs text-brand-600 hover:underline">Save</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
