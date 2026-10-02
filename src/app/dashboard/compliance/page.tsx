import { createClient } from "@/lib/supabase/server";
import {
  recordFiling,
  addComplianceDocument,
  deleteComplianceDocument,
  publishPolicy,
  acknowledgePolicy,
} from "./actions";

const FILING_KEYS = ["PAYE", "NSSF", "SHIF", "Housing Levy", "NITA"];

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export default async function CompliancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";

  const [filingRes, docsRes, policiesRes, acksRes, employeesRes] = await Promise.all([
    isHrLike
      ? supabase
          .from("statutory_filing_log")
          .select("id, filing_key, period, filed_on")
          .order("period", { ascending: false })
      : Promise.resolve({ data: null }),
    isHrLike
      ? supabase
          .from("compliance_documents")
          .select("id, doc_type, label, expiry_date, alert_threshold_days, notes, employees(name)")
          .order("expiry_date")
      : Promise.resolve({ data: null }),
    supabase.from("policies").select("id, name, version, published_on").order("published_on", { ascending: false }),
    appUser?.employee_id
      ? supabase.from("policy_acknowledgments").select("policy_id").eq("employee_id", appUser.employee_id)
      : Promise.resolve({ data: [] as { policy_id: string }[] | null }),
    isHrLike
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  const filings = filingRes.data;
  const docs = docsRes.data;
  const policies = policiesRes.data ?? [];
  const ackedPolicyIds = new Set((acksRes.data ?? []).map((a) => a.policy_id));
  const employees = employeesRes.data;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Compliance</h1>

      {isHrLike && (
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Statutory filings</h2>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Filing</th>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Filed on</th>
                </tr>
              </thead>
              <tbody>
                {(filings ?? []).map((f) => (
                  <tr key={f.id} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-4 py-2">{f.filing_key}</td>
                    <td className="px-4 py-2">{f.period}</td>
                    <td className="px-4 py-2">{f.filed_on}</td>
                  </tr>
                ))}
                {(!filings || filings.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                      No filings recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form action={recordFiling} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <select name="filing_key" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Filing type</option>
              {FILING_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              name="period"
              placeholder="Period (e.g. 2026-09)"
              required
              className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <input
              name="filed_on"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Mark filed
            </button>
          </form>
        </div>
      )}

      {isHrLike && (
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Compliance documents</h2>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Document</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Expiry</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(docs ?? []).map((d) => {
                  const remaining = daysUntil(d.expiry_date);
                  const expired = remaining < 0;
                  const alerting = !expired && remaining <= d.alert_threshold_days;
                  return (
                    <tr key={d.id} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="px-4 py-2">{d.label}</td>
                      <td className="px-4 py-2">{d.doc_type}</td>
                      <td className="px-4 py-2">
                        {(d.employees as unknown as { name: string } | null)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2">{d.expiry_date}</td>
                      <td className="px-4 py-2">
                        {expired && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Expired</span>
                        )}
                        {!expired && alerting && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                            Expiring in {remaining}d
                          </span>
                        )}
                        {!expired && !alerting && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Valid</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={deleteComplianceDocument.bind(null, d.id)}>
                          <button type="submit" className="text-xs text-red-600 hover:underline">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {(!docs || docs.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                      No compliance documents tracked yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form
            action={addComplianceDocument}
            className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm"
          >
            <input name="label" placeholder="Document label" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="doc_type" placeholder="Type (License, Permit, Insurance...)" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <select name="employee_id" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Org-wide (no employee)</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <input name="expiry_date" type="date" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="alert_threshold_days" type="number" placeholder="Alert threshold (days)" defaultValue={30} className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="notes" placeholder="Notes" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <button type="submit" className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Track document
            </button>
          </form>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Policies</h2>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Policy</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Published</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.version ?? "—"}</td>
                  <td className="px-4 py-2">{p.published_on}</td>
                  <td className="px-4 py-2 text-right">
                    {appUser?.employee_id &&
                      (ackedPolicyIds.has(p.id) ? (
                        <span className="text-xs text-green-700">Acknowledged</span>
                      ) : (
                        <form action={acknowledgePolicy.bind(null, p.id)}>
                          <button type="submit" className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1">
                            Acknowledge
                          </button>
                        </form>
                      ))}
                  </td>
                </tr>
              ))}
              {policies.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                    No policies published yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {isHrLike && (
          <form action={publishPolicy} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <input name="name" placeholder="Policy name" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="version" placeholder="Version" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input
              name="published_on"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Publish policy
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
