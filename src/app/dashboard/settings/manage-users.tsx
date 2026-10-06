"use client";

import { useActionState, useState } from "react";
import {
  createUserLoginAction,
  updateUserRoleAction,
  removeUserAccessAction,
  type SettingsActionState,
} from "./actions";

const ROLES = ["admin", "hr", "manager", "employee"] as const;
const initialActionState: SettingsActionState = {};

type CustomRoleOption = { id: string; name: string; base_role: string };

function RoleOptions({ customRoles }: { customRoles: CustomRoleOption[] }) {
  return (
    <>
      <optgroup label="Built-in">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </optgroup>
      {customRoles.length > 0 && (
        <optgroup label="Custom">
          {customRoles.map((r) => (
            <option key={r.id} value={`custom:${r.id}`}>
              {r.name} (based on {r.base_role})
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

type AppUserRow = {
  id: string;
  role: string;
  custom_role_id: string | null;
  username: string | null;
  employee_id: string | null;
  created_at: string;
  employees: { name: string } | null;
};

export default function ManageUsers({
  users,
  employees,
  currentUserId,
  customRoles,
}: {
  users: AppUserRow[];
  employees: { id: string; name: string }[];
  currentUserId: string;
  customRoles: CustomRoleOption[];
}) {
  const linkedEmployeeIds = new Set(users.map((u) => u.employee_id).filter(Boolean));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Manage Users</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Create a login for someone and assign their role. Removing access here deletes their app role — it doesn&apos;t delete
          their sign-in, so re-adding them later restores access without a new password. Admin only.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Linked employee</th>
              <th className="px-3 py-2 font-medium">Added</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} customRoles={customRoles} />
            ))}
          </tbody>
        </table>
      </div>

      <CreateLoginForm employees={employees} linkedEmployeeIds={linkedEmployeeIds} customRoles={customRoles} />
    </div>
  );
}

function UserRow({ user, isSelf, customRoles }: { user: AppUserRow; isSelf: boolean; customRoles: CustomRoleOption[] }) {
  const [roleState, updateRole, roleUpdating] = useActionState(updateUserRoleAction, initialActionState);
  const [removeState, removeAccess, removing] = useActionState(removeUserAccessAction, initialActionState);

  return (
    <tr className="border-t border-neutral-100 dark:border-neutral-800 align-top">
      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">{user.username ?? "—"}</td>
      <td className="px-3 py-2">
        <form action={updateRole} className="flex items-center gap-2 flex-wrap">
          <input type="hidden" name="user_id" value={user.id} />
          <select
            name="role"
            defaultValue={user.custom_role_id ? `custom:${user.custom_role_id}` : user.role}
            className="border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            <RoleOptions customRoles={customRoles} />
          </select>
          <button type="submit" disabled={roleUpdating} className="text-xs text-brand-600 hover:underline disabled:opacity-50">
            {roleUpdating ? "Saving..." : "Save"}
          </button>
        </form>
        {roleState.error && <p className="text-xs text-red-600 mt-1 max-w-xs">{roleState.error}</p>}
      </td>
      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">{user.employees?.name ?? "—"}</td>
      <td className="px-3 py-2 text-neutral-400 dark:text-neutral-500 text-xs">{new Date(user.created_at).toLocaleDateString()}</td>
      <td className="px-3 py-2">
        {!isSelf && (
          <>
            <form action={removeAccess}>
              <input type="hidden" name="user_id" value={user.id} />
              <button type="submit" disabled={removing} className="text-xs text-red-600 hover:underline disabled:opacity-50">
                {removing ? "Removing..." : "Remove access"}
              </button>
            </form>
            {removeState.error && <p className="text-xs text-red-600 mt-1 max-w-xs">{removeState.error}</p>}
          </>
        )}
        {isSelf && <span className="text-xs text-neutral-400 dark:text-neutral-500">You</span>}
      </td>
    </tr>
  );
}

function CreateLoginForm({
  employees,
  linkedEmployeeIds,
  customRoles,
}: {
  employees: { id: string; name: string }[];
  linkedEmployeeIds: Set<string | null>;
  customRoles: CustomRoleOption[];
}) {
  const [state, formAction, pending] = useActionState(createUserLoginAction, initialActionState);
  // Remount the form on success so the email/password fields clear — an
  // uncontrolled form otherwise keeps showing the just-used temporary
  // password, which reads as "did that actually work?". Adjusted during
  // render (React's recommended way to react to a prop/state change)
  // rather than in an effect, to avoid the extra render pass.
  const [formKey, setFormKey] = useState(0);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.success) setFormKey((k) => k + 1);
  }

  return (
    <div className="border-t border-[var(--border-subtle)] pt-4">
      <form key={formKey} action={formAction} className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Username or email</label>
          <input
            name="identifier"
            type="text"
            required
            autoCapitalize="none"
            placeholder="e.g. jane.doe"
            className="border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Temporary password</label>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            placeholder="8+ characters"
            className="border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Role</label>
          <select
            name="role"
            defaultValue="employee"
            className="border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            <RoleOptions customRoles={customRoles} />
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Link to employee (optional)</label>
          <select
            name="employee_id"
            defaultValue=""
            className="border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            <option value="">Not linked</option>
            {employees
              .filter((e) => !linkedEmployeeIds.has(e.id))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-1.5 px-4 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create login"}
        </button>
      </form>
      {state.error && <p className="text-xs text-red-600 mt-2">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600 mt-2">Login created. Share the username (or email) and password with them directly.</p>}
      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">
        Type a username (letters, numbers, dots, dashes) for people without an email, or a full email address. Share the username/email and temporary password with them directly — no invite email is sent. They can sign in right away at{" "}
        <span className="font-mono">/login</span>.
      </p>
    </div>
  );
}
