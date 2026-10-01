// Area 05 §10/§15 "Help" — service catalogue as the knowledge base/FAQ
// substitute (no separate KB table exists in this codebase, and building one
// is outside Area 05's own boundary §29) plus the HR contact route.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";

export default async function HelpPage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);

  const { data: catalogue } = await supabase
    .from("service_catalogue")
    .select("category, label, description, default_sla_hours")
    .eq("org_id", ctx.orgId)
    .eq("active", true)
    .order("category");

  const byCategory = new Map<string, typeof catalogue>();
  for (const item of catalogue ?? []) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category)!.push(item);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Help</h1>
        <p className="text-sm text-neutral-500 mt-1">What HR can help with, and how quickly to expect a response.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <p className="text-sm text-neutral-700">
          Have a specific issue? <Link href="/dashboard/me/requests" className="text-brand-600 hover:underline font-medium">Raise a request with HR</Link> and track it from My Requests.
        </p>
      </div>

      {[...byCategory.entries()].map(([category, items]) => (
        <div key={category} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">{category}</h2>
          <ul className="space-y-2">
            {(items ?? []).map((item) => (
              <li key={item.label} className="text-sm border-b border-neutral-100 last:border-0 pb-2">
                <p className="font-medium text-neutral-900">{item.label}</p>
                {item.description && <p className="text-neutral-500">{item.description}</p>}
                <p className="text-xs text-neutral-400 mt-0.5">Typical response: {item.default_sla_hours}h</p>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {byCategory.size === 0 && (
        <p className="text-sm text-neutral-400">No service catalogue configured yet — contact HR directly.</p>
      )}
    </div>
  );
}
