"use client";

import { toggleRolePermissionAction } from "./actions";

export function RolePermissionToggle({
  roleCode,
  permissionId,
  resource,
  action,
  sensitivity,
  scope,
  checked,
}: {
  roleCode: string;
  permissionId: string;
  resource: string;
  action: string;
  sensitivity: string;
  scope: string;
  checked: boolean;
}) {
  return (
    <form
      action={toggleRolePermissionAction}
      onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}
    >
      <input type="hidden" name="role_code" value={roleCode} />
      <input type="hidden" name="permission_id" value={permissionId} />
      <input type="hidden" name="resource" value={resource} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="sensitivity" value={sensitivity} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="grant" value={checked ? "false" : "true"} />
      <input
        type="checkbox"
        defaultChecked={checked}
        className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-brand-600 focus:ring-brand-500/30"
        title={`${scope} scope`}
      />
    </form>
  );
}
