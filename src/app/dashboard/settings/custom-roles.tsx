"use client";

import { useActionState, useState } from "react";
import { ALL_MODULES } from "@/lib/auth/roles";
import {
  createCustomRoleAction,
  deleteCustomRoleAction,
  toggleCustomRoleModuleAction,
  type SettingsActionState,
} from "./actions";

type CustomRole = { id: string; code: string; name: string; description: string | null; base_role: string };
type ModuleRow = { role_id: string; module_key: string; can_view: boolean };

const initial: SettingsActionState = {};

export default function CustomRoles({
  roles,
  modules,
  baseVisibility,
  userCounts,
}: {
  roles: CustomRole[];
  modules: ModuleRow[];
  baseVisibility: Record<string, string[]>;
  userCounts: Record<string, number>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Custom Roles</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Make a role such as &ldquo;Payroll Officer&rdquo; or &ldquo;Team Lead&rdquo;. Each one starts as a copy of HR, Manager or
          Employee and you switch things off. It can never have more access than the role it&apos;s based on. Assign it to
          people under Manage Users. Pages a role has switched off are blocked even if someone types the address.
        </p>
      </div>

      <CreateForm />

      {roles.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">No custom roles yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {roles.map((r) => (
            <RoleItem
              key={r.id}
              role={r}
              open={openId === r.id}
              onToggle={() => setOpenId(openId === r.id ? null : r.id)}
              modules={modules.filter((m) => m.role_id === r.id)}
              baseVisible={new Set(baseVisibility[r.base_role] ?? [])}
              userCount={userCounts[r.id] ?? 0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateForm() {
  const [state, action, pending] = useActionState(createCustomRoleAction, initial);
  const [key, setKey] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.success) setKey((k) => k + 1);
  }
  const field =
    "border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";
  return (
    <div>
      <form key={key} action={action} className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Role name</label>
          <input name="name" required maxLength={40} placeholder="e.g. Payroll Officer" className={field} />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Based on</label>
          <select name="base_role" defaultValue="hr" className={field}>
            <option value="hr">HR</option>
            <option value="manager">Manager</option>
            <option value="employee">Employee</option>
          </select>
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">What is it for? (optional)</label>
          <input name="description" maxLength={120} className={`${field} w-full`} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-1.5 px-4 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create role"}
        </button>
      </form>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600 mt-2">Role created. Open it below to choose what it can see, then fine-tune permissions in Roles &amp; Access.</p>}
    </div>
  );
}

function RoleItem({
  role,
  open,
  onToggle,
  modules,
  baseVisible,
  userCount,
}: {
  role: CustomRole;
  open: boolean;
  onToggle: () => void;
  modules: ModuleRow[];
  baseVisible: Set<string>;
  userCount: number;
}) {
  const [delState, delAction, deleting] = useActionState(deleteCustomRoleAction, initial);
  const viewByKey = new Map(modules.map((m) => [m.module_key, m.can_view]));

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={onToggle} aria-expanded={open} className="text-left">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            {role.name} <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500 capitalize">· based on {role.base_role} · {userCount} {userCount === 1 ? "person" : "people"}</span>
          </p>
          {role.description && <p className="text-xs text-neutral-500 dark:text-neutral-400">{role.description}</p>}
        </button>
        <div className="flex items-center gap-3 text-xs">
          <a href={`/dashboard/settings?role=${role.code}#roles-access`} className="text-brand-600 hover:underline">
            Edit permissions
          </a>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`Delete "${role.name}"? ${userCount} ${userCount === 1 ? "person" : "people"} will go back to the ${role.base_role} role.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="role_id" value={role.id} />
            <button type="submit" disabled={deleting} className="text-red-600 hover:underline disabled:opacity-50">
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </form>
        </div>
      </div>
      {delState.error && <p className="text-xs text-red-600 mt-1">{delState.error}</p>}

      {open && (
        <div className="mt-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">Tick the modules this role can open.</p>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_MODULES.filter((m) => baseVisible.has(m.key)).map((m) => (
              <li key={m.key}>
                <ModuleToggle roleId={role.id} moduleKey={m.key} label={m.label} checked={viewByKey.get(m.key) ?? true} locked={m.key === "dashboard"} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function ModuleToggle({ roleId, moduleKey, label, checked, locked }: { roleId: string; moduleKey: string; label: string; checked: boolean; locked: boolean }) {
  return (
    <form action={toggleCustomRoleModuleAction} onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}>
      <input type="hidden" name="role_id" value={roleId} />
      <input type="hidden" name="module_key" value={moduleKey} />
      <input type="hidden" name="can_view" value={checked ? "false" : "true"} />
      <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
        <input
          type="checkbox"
          defaultChecked={checked}
          disabled={locked}
          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-brand-600 focus:ring-brand-500/30 disabled:opacity-40"
        />
        {label}
      </label>
    </form>
  );
}
