import { createUserLoginAction, updateUserRoleAction, removeUserAccessAction } from "./actions";

const ROLES = ["admin", "hr", "manager", "employee"] as const;

type AppUserRow = {
  id: string;
  role: string;
  employee_id: string | null;
  created_at: string;
  employees: { name: string } | null;
};

export default function ManageUsers({
  users,
  employees,
  currentUserId,
}: {
  users: AppUserRow[];
  employees: { id: string; name: string }[];
  currentUserId: string;
}) {
  const linkedEmployeeIds = new Set(users.map((u) => u.employee_id).filter(Boolean));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Manage Users</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Create a login for someone and assign their role. Removing access here deletes their app role — it doesn&apos;t delete
          their sign-in, so re-adding them later restores access without a new password. Admin only.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-neutral-600 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Linked employee</th>
              <th className="px-3 py-2 font-medium">Added</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="px-3 py-2">
                  <form action={updateUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="user_id" value={u.id} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="border border-neutral-300 rounded-lg text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs text-brand-600 hover:underline">
                      Save
                    </button>
                  </form>
                </td>
                <td className="px-3 py-2 text-neutral-600">{u.employees?.name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  {u.id !== currentUserId && (
                    <form action={removeUserAccessAction}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Remove access
                      </button>
                    </form>
                  )}
                  {u.id === currentUserId && <span className="text-xs text-neutral-400">You</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={createUserLoginAction} className="border-t border-[var(--border-subtle)] pt-4 flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Email</label>
          <input
            name="email"
            type="email"
            required
            className="border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Temporary password</label>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            placeholder="8+ characters"
            className="border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Role</label>
          <select
            name="role"
            defaultValue="employee"
            className="border border-neutral-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Link to employee (optional)</label>
          <select
            name="employee_id"
            defaultValue=""
            className="border border-neutral-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
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
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-1.5 px-4 text-sm font-medium">
          Create login
        </button>
      </form>
      <p className="text-xs text-neutral-400">
        Share the email and temporary password with them directly — no invite email is sent. They can sign in right away at{" "}
        <span className="font-mono">/login</span>.
      </p>
    </div>
  );
}
