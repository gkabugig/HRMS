"use client";

import { toggleModulePermission } from "./actions";

export function PermissionToggle({
  role,
  moduleKey,
  checked,
  disabled,
}: {
  role: string;
  moduleKey: string;
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <form
      action={toggleModulePermission}
      onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}
    >
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="module_key" value={moduleKey} />
      <input type="hidden" name="can_view" value={checked ? "false" : "true"} />
      <input
        type="checkbox"
        defaultChecked={checked}
        disabled={disabled}
        className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-brand-600 focus:ring-brand-500/30 disabled:opacity-40"
        title={disabled ? "Always visible" : undefined}
      />
    </form>
  );
}
