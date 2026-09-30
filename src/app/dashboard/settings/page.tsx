import { createClient } from "@/lib/supabase/server";
import { updateRates } from "./actions";
import { PermissionToggle } from "./permission-toggle";
import { ALL_MODULES } from "@/lib/auth/roles";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
const ROLES = ["admin", "hr", "manager", "employee"] as const;

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: rates }, { data: permissions }] = await Promise.all([
    supabase
      .from("statutory_rates")
      .select("*")
      .eq("org_id", DEFAULT_ORG_ID)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("role_module_permissions")
      .select("role, module_key, can_view")
      .eq("org_id", DEFAULT_ORG_ID),
  ]);

  const permByKey = new Map(
    (permissions ?? []).map((p) => [`${p.role}:${p.module_key}`, p.can_view])
  );
  const isVisible = (role: string, moduleKey: string) => permByKey.get(`${role}:${moduleKey}`) ?? true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-500">Statutory rates and role-based module visibility.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Roles &amp; Permissions</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Controls which modules show up in each role&apos;s sidebar. This is a visibility layer
            only — it doesn&apos;t change what data a role can actually read or edit, which is still
            enforced by the underlying security rules regardless of what&apos;s toggled here.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-600 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Module</th>
                {ROLES.map((role) => (
                  <th key={role} className="px-3 py-2 font-medium capitalize text-center">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_MODULES.map((m) => (
                <tr key={m.key} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{m.label}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-3 py-2 text-center">
                      <PermissionToggle
                        role={role}
                        moduleKey={m.key}
                        checked={isVisible(role, m.key)}
                        disabled={m.key === "dashboard"}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form action={updateRates} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4 text-sm">
        <h2 className="text-sm font-semibold text-neutral-900">Statutory Rates</h2>
        <div>
          <label className="block text-neutral-700 mb-1">PAYE bands (JSON)</label>
          <textarea
            name="paye_bands"
            rows={4}
            defaultValue={JSON.stringify(rates?.paye_bands ?? [], null, 2)}
            className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2 font-mono text-xs"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Personal relief" name="personal_relief" defaultValue={rates?.personal_relief} />
          <Field label="NSSF Tier 1 ceiling" name="nssf_tier1_ceiling" defaultValue={rates?.nssf_tier1_ceiling} />
          <Field label="NSSF Tier 2 ceiling" name="nssf_tier2_ceiling" defaultValue={rates?.nssf_tier2_ceiling} />
          <Field label="NSSF rate" name="nssf_rate" step="0.0001" defaultValue={rates?.nssf_rate} />
          <Field label="SHIF rate" name="shif_rate" step="0.0001" defaultValue={rates?.shif_rate} />
          <Field label="SHIF minimum" name="shif_min" defaultValue={rates?.shif_min} />
          <Field label="Housing levy rate" name="housing_levy_rate" step="0.0001" defaultValue={rates?.housing_levy_rate} />
        </div>
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 px-4 font-medium">
          Save rates
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  step = "0.01",
}: {
  label: string;
  name: string;
  defaultValue?: number | null;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-neutral-700 mb-1">{label}</label>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue ?? undefined}
        className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
      />
    </div>
  );
}
