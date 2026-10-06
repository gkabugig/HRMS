import { createClient } from "@/lib/supabase/server";
import { updateRates, updatePayrollControls } from "./actions";
import { PermissionToggle } from "./permission-toggle";
import { RolesAccess } from "./roles-access";
import { ALL_MODULES } from "@/lib/auth/roles";
import ManageUsers from "./manage-users";
import CustomRoles from "./custom-roles";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
const ROLES = ["admin", "hr", "manager", "employee"] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role: roleParam } = await searchParams;
  // Built-in role code ("hr") or a custom role's code ("custom_payroll_officer").
  const selectedRole = roleParam && /^[a-z0-9_]{2,60}$/.test(roleParam) ? roleParam : "admin";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: currentAppUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();
  const orgId = currentAppUser?.org_id ?? DEFAULT_ORG_ID;
  const isAdmin = currentAppUser?.role === "admin";

  const [
    { data: rates },
    { data: permissions },
    { data: org },
    { data: appUsers },
    { data: employees },
    { data: rbacRoles },
    { data: rbacPermissions },
    { data: rbacGrants },
    { data: rbacModules },
  ] = await Promise.all([
    supabase
      .from("statutory_rates")
      .select("*")
      .eq("org_id", orgId)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("role_module_permissions")
      .select("role, module_key, can_view")
      .eq("org_id", orgId),
    supabase.from("organizations").select("payroll_variance_warning_pct").eq("id", orgId).maybeSingle(),
    isAdmin
      ? supabase.from("app_users").select("id, role, custom_role_id, username, employee_id, created_at, employees(name)").order("created_at", { ascending: true })
      : Promise.resolve({ data: null }),
    isAdmin ? supabase.from("employees").select("id, name").order("name") : Promise.resolve({ data: null }),
    isAdmin
      ? supabase.from("rbac_roles").select("id, code, name, description, is_system, base_role").eq("org_id", orgId)
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase.from("rbac_permissions").select("id, resource, action, sensitivity, description").order("resource")
      : Promise.resolve({ data: null }),
    isAdmin ? supabase.from("rbac_role_permissions").select("role_id, permission_id, scope") : Promise.resolve({ data: null }),
    isAdmin ? supabase.from("rbac_role_modules").select("role_id, module_key, can_view") : Promise.resolve({ data: null }),
  ]);

  const permByKey = new Map(
    (permissions ?? []).map((p) => [`${p.role}:${p.module_key}`, p.can_view])
  );
  const isVisible = (role: string, moduleKey: string) => permByKey.get(`${role}:${moduleKey}`) ?? true;

  const customRoles = (rbacRoles ?? []).filter((r) => !r.is_system);
  const customRoleOptions = customRoles.map((r) => ({ id: r.id, name: r.name, base_role: r.base_role as string }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Settings</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Statutory rates and role-based module visibility.</p>
      </div>

      {isAdmin && (
        <ManageUsers
          users={(appUsers ?? []) as unknown as Parameters<typeof ManageUsers>[0]["users"]}
          employees={employees ?? []}
          currentUserId={user!.id}
          customRoles={customRoleOptions}
        />
      )}

      {isAdmin && (
        <CustomRoles
          roles={customRoles.map((r) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            description: r.description,
            base_role: r.base_role as string,
          }))}
          modules={rbacModules ?? []}
          baseVisibility={Object.fromEntries(
            (["hr", "manager", "employee"] as const).map((role) => [
              role,
              ALL_MODULES.filter((m) => isVisible(role, m.key)).map((m) => m.key),
            ])
          )}
          userCounts={Object.fromEntries(
            customRoles.map((r) => [r.id, (appUsers ?? []).filter((u) => (u as { custom_role_id?: string | null }).custom_role_id === r.id).length])
          )}
        />
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Roles &amp; Permissions</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Controls which modules show up in each role&apos;s sidebar. This is a visibility layer
            only — it doesn&apos;t change what data a role can actually read or edit, which is still
            enforced by the underlying security rules regardless of what&apos;s toggled here.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-600 dark:text-neutral-300 text-left">
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
                <tr key={m.key} className="border-t border-neutral-100 dark:border-neutral-800">
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

      {isAdmin && (
        <div
          id="roles-access"
          className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4"
        >
          <RolesAccess
            roles={(rbacRoles ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name, is_system: r.is_system, base_role: r.base_role as string | null }))}
            permissions={rbacPermissions ?? []}
            grants={rbacGrants ?? []}
            selectedRole={selectedRole}
          />
        </div>
      )}

      <form action={updateRates} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4 text-sm">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Statutory Rates</h2>
        <div>
          <label className="block text-neutral-700 dark:text-neutral-200 mb-1">PAYE bands (JSON)</label>
          <textarea
            name="paye_bands"
            rows={4}
            defaultValue={JSON.stringify(rates?.paye_bands ?? [], null, 2)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2 font-mono text-xs"
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

      <form action={updatePayrollControls} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-3 text-sm">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Payroll Controls</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            The Payroll Command Centre flags an employee&apos;s gross pay when it moves more than this much
            from the previous run.
          </p>
        </div>
        <Field
          label="Variance warning threshold (%)"
          name="payroll_variance_warning_pct"
          step="1"
          defaultValue={org?.payroll_variance_warning_pct ?? 15}
        />
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 px-4 font-medium">
          Save
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
      <label className="block text-neutral-700 dark:text-neutral-200 mb-1">{label}</label>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue ?? undefined}
        className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
      />
    </div>
  );
}
