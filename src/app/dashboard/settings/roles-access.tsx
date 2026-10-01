import { Fragment } from "react";
import { RolePermissionToggle } from "./role-permission-toggle";

// Scopes with a real resolver behind them today (user_can_access_employee/
// _document/_payslip in 0037, plus the inline organisation-scope checks on
// every other resource's coarse authorize_request() fallback). business_unit
// and team are real enum values (future-proofing, per spec §9/§11) but no
// organisation-hierarchy table exists yet for either, so toggling them on
// would silently grant nothing — they're shown disabled rather than hidden,
// so it's clear they exist in the model without pretending they work.
const EDITABLE_SCOPES = ["organisation", "self", "direct_reports", "department"] as const;
const UNIMPLEMENTED_SCOPES = ["business_unit", "team"] as const;

const ROLES = ["admin", "hr", "manager", "employee"] as const;

type Permission = {
  id: string;
  resource: string;
  action: string;
  sensitivity: string;
  description: string | null;
};

type RoleRow = { id: string; code: string };

type GrantRow = { role_id: string; permission_id: string; scope: string };

export function RolesAccess({
  roles,
  permissions,
  grants,
  selectedRole,
}: {
  roles: RoleRow[];
  permissions: Permission[];
  grants: GrantRow[];
  selectedRole: (typeof ROLES)[number];
}) {
  const role = roles.find((r) => r.code === selectedRole);
  const grantSet = new Set(
    grants.filter((g) => g.role_id === role?.id).map((g) => `${g.permission_id}:${g.scope}`)
  );
  const isGranted = (permissionId: string, scope: string) => grantSet.has(`${permissionId}:${scope}`);

  // Group the catalogue by resource for a readable table (32 rows flat is a
  // lot to scan; grouped under a resource header reads more like a real
  // permissions screen).
  const byResource = new Map<string, Permission[]>();
  for (const p of permissions) {
    if (!byResource.has(p.resource)) byResource.set(p.resource, []);
    byResource.get(p.resource)!.push(p);
  }

  // Effective-access summary: a plain-English read of what this role can do
  // right now, derived from the same grant data the grid above edits.
  const summaryLines: string[] = [];
  for (const p of permissions) {
    const grantedScopes = EDITABLE_SCOPES.filter((s) => isGranted(p.id, s));
    if (grantedScopes.length > 0) {
      summaryLines.push(
        `${p.resource}.${p.action} (${p.sensitivity}) — ${grantedScopes.join(", ")}`
      );
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Roles &amp; Access</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Fine-grained, per-resource access control (Universal RBAC) — separate from the module
          visibility matrix above. This controls what a role can actually read, edit, or export,
          enforced by database-level security policies, not just what shows in the sidebar.
          Highly-restricted permissions (marked below) cover payroll figures and sensitive
          personal data — grant them deliberately.
        </p>
      </div>

      <div className="flex gap-1 border-b border-neutral-200">
        {ROLES.map((r) => (
          <a
            key={r}
            href={`/dashboard/settings?role=${r}#roles-access`}
            className={`px-3 py-1.5 text-sm rounded-t-lg capitalize transition-colors ${
              r === selectedRole
                ? "bg-[var(--surface)] border border-b-0 border-[var(--border-subtle)] text-neutral-900 font-medium"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {r}
          </a>
        ))}
      </div>

      {!role ? (
        <p className="text-sm text-amber-600">
          This organisation has no &quot;{selectedRole}&quot; role row yet (it is created
          automatically the first time a user is assigned that role).
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-600 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Permission</th>
                  {EDITABLE_SCOPES.map((s) => (
                    <th key={s} className="px-3 py-2 font-medium text-center capitalize">
                      {s.replace("_", " ")}
                    </th>
                  ))}
                  {UNIMPLEMENTED_SCOPES.map((s) => (
                    <th key={s} className="px-3 py-2 font-medium text-center capitalize text-neutral-300">
                      {s.replace("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...byResource.entries()].map(([resource, perms]) => (
                  <Fragment key={resource}>
                    <tr className="border-t border-neutral-200 bg-neutral-50">
                      <td colSpan={EDITABLE_SCOPES.length + UNIMPLEMENTED_SCOPES.length + 1} className="px-3 py-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                        {resource.replace("_", " ")}
                      </td>
                    </tr>
                    {perms.map((p) => (
                      <tr key={p.id} className="border-t border-neutral-100">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span>{p.action}</span>
                            {p.sensitivity !== "normal" && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                                  p.sensitivity === "highly_restricted"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {p.sensitivity === "highly_restricted" ? "Highly restricted" : "Confidential"}
                              </span>
                            )}
                          </div>
                          {p.description && <div className="text-xs text-neutral-400 mt-0.5">{p.description}</div>}
                        </td>
                        {EDITABLE_SCOPES.map((scope) => (
                          <td key={scope} className="px-3 py-2 text-center">
                            <RolePermissionToggle
                              roleCode={selectedRole}
                              permissionId={p.id}
                              resource={p.resource}
                              action={p.action}
                              sensitivity={p.sensitivity}
                              scope={scope}
                              checked={isGranted(p.id, scope)}
                            />
                          </td>
                        ))}
                        {UNIMPLEMENTED_SCOPES.map((scope) => (
                          <td key={scope} className="px-3 py-2 text-center text-neutral-300" title="No organisation-hierarchy table exists yet for this scope">
                            <input type="checkbox" disabled className="h-4 w-4 rounded border-neutral-200" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-neutral-700 mb-2">
              Effective access preview — what &quot;{selectedRole}&quot; can do right now
            </h3>
            {summaryLines.length === 0 ? (
              <p className="text-xs text-neutral-400">No permissions granted to this role.</p>
            ) : (
              <ul className="text-xs text-neutral-600 space-y-0.5 columns-1 sm:columns-2">
                {summaryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
