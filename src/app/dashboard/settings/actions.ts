"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/current-org";
import { revalidatePath } from "next/cache";
import { createAppUserLogin, type AppRole } from "@/lib/auth/provision-user";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { ALL_MODULES, DEFAULT_VISIBLE_MODULES, type UserRole } from "@/lib/auth/roles";
import { customRoleCode, validateCustomRoleName } from "@/lib/auth/module-access";


async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || appUser.role !== "admin") {
    throw new Error("Only an admin can manage user logins.");
  }
  return { supabase, userId: user.id, orgId: appUser.org_id };
}

export async function updateRates(formData: FormData) {
  const supabase = await createClient();

  const payload = {
    org_id: await requireOrgId(supabase),
    effective_from: new Date().toISOString().slice(0, 10),
    paye_bands: JSON.parse(String(formData.get("paye_bands"))),
    personal_relief: Number(formData.get("personal_relief")),
    nssf_tier1_ceiling: Number(formData.get("nssf_tier1_ceiling")),
    nssf_tier2_ceiling: Number(formData.get("nssf_tier2_ceiling")),
    nssf_rate: Number(formData.get("nssf_rate")),
    shif_rate: Number(formData.get("shif_rate")),
    shif_min: Number(formData.get("shif_min")),
    housing_levy_rate: Number(formData.get("housing_levy_rate")),
  };

  const { error } = await supabase
    .from("statutory_rates")
    .upsert(payload, { onConflict: "org_id,effective_from" });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
}

// Payroll Command Centre's exception thresholds are read from this
// per-org column rather than hard-coded (spec §7: "do not hard-code a
// universal 10%/KES threshold without an organisation setting").
export async function updatePayrollControls(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user!.id).maybeSingle();
  if (!appUser || (appUser.role !== "admin" && appUser.role !== "hr")) {
    throw new Error("Not authorised.");
  }

  const pct = Number(formData.get("payroll_variance_warning_pct"));
  if (!Number.isFinite(pct) || pct <= 0) throw new Error("Enter a valid percentage.");

  const { error } = await supabase.from("organizations").update({ payroll_variance_warning_pct: pct }).eq("id", appUser.org_id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
}

// Toggle a single role/permission/scope cell in the Universal RBAC "Roles &
// Access" grid (supabase/migrations/0033-0038). Unlike toggleModulePermission
// below, this *does* change what the underlying RESTRICTIVE RLS policies and
// authorize_request() allow — it edits rbac_role_permissions directly, the
// same table the Employees/Documents/Payroll record-level resolvers read
// from. Gated on the legacy admin role (not on the RBAC system's own
// rbac.manage permission) by design: migration 0033's bootstrap comment
// explains why — the screen that configures RBAC can't be gated by the
// system it configures, or an admin could lock themselves out of fixing a
// bad grant.
export async function toggleRolePermissionAction(formData: FormData) {
  const { supabase, userId, orgId } = await requireAdmin();

  const roleCode = String(formData.get("role_code") || "");
  const roleIdParam = String(formData.get("role_id") || "");
  const permissionId = String(formData.get("permission_id") || "");
  const scope = String(formData.get("scope") || "");
  const grant = formData.get("grant") === "true";
  const resource = String(formData.get("resource") || "");
  const action = String(formData.get("action") || "");
  const sensitivity = String(formData.get("sensitivity") || "");
  if ((!roleCode && !roleIdParam) || !permissionId || !scope) throw new Error("Missing role, permission, or scope.");

  const roleQuery = supabase.from("rbac_roles").select("id").eq("org_id", orgId);
  const { data: role } = await (roleIdParam ? roleQuery.eq("id", roleIdParam) : roleQuery.eq("code", roleCode)).maybeSingle();
  if (!role) throw new Error("Role not found for this organisation.");

  if (grant) {
    const { error } = await supabase
      .from("rbac_role_permissions")
      .upsert({ role_id: role.id, permission_id: permissionId, scope }, { onConflict: "role_id,permission_id,scope" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("rbac_role_permissions")
      .delete()
      .eq("role_id", role.id)
      .eq("permission_id", permissionId)
      .eq("scope", scope);
    if (error) throw new Error(error.message);
  }

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: grant ? "rbac.permission_granted" : "rbac.permission_revoked",
    resourceType: "rbac_role_permission",
    resourceId: role.id,
    eventCategory: "security",
    riskLevel: sensitivity === "highly_restricted" ? "high" : sensitivity === "confidential" ? "elevated" : "normal",
    after: { role: roleCode, resource, action, sensitivity, scope, grant },
  });

  revalidatePath("/dashboard/settings");
}

// Toggle a single role/module cell in the Roles & Permissions matrix. This
// is a UI-visibility layer only (see 0014_role_module_permissions.sql) — it
// hides/shows a nav item for that role, it does not change what the
// underlying RLS policies allow that role to read or write.
export async function toggleModulePermission(formData: FormData) {
  const supabase = await createClient();
  const role = String(formData.get("role") || "");
  const moduleKey = String(formData.get("module_key") || "");
  const canView = formData.get("can_view") === "true";
  if (!role || !moduleKey) throw new Error("Missing role or module.");

  const { error } = await supabase.from("role_module_permissions").upsert(
    { org_id: await requireOrgId(supabase), role, module_key: moduleKey, can_view: canView },
    { onConflict: "org_id,role,module_key" }
  );
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
}

// These three are wired up via useActionState (see manage-users.tsx), so
// failures come back as state the form can render inline — a thrown Error
// here would bubble to the route's error.tsx, and Next.js redacts the
// message of any error that surfaces through a Server Component re-render
// in production (only the digest survives), which is exactly what made
// "email already registered" show up as an opaque, dashboard-wide crash
// instead of a message next to the form. See
// node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md
// ("Handling expected errors" / "Server Functions") — expected, user-facing
// failures should be modeled as return values, not thrown.
export type SettingsActionState = { error?: string; success?: boolean };

// Manage Users: admin creates the login and assigns the role directly —
// no Supabase dashboard access needed. Restricted to admin (not hr): this
// is account/security provisioning, not day-to-day HR data entry.
export async function createUserLoginAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const { supabase, userId, orgId } = await requireAdmin();

    const identifier = String(formData.get("identifier") || "").trim();
    const password = String(formData.get("password") || "");
    const choice = String(formData.get("role") || "");
    const employeeId = String(formData.get("employee_id") || "") || null;

    if (!identifier) return { error: "Enter a username or an email." };
    if (password.length < 8) return { error: "Password must be at least 8 characters." };

    let role = choice as AppRole;
    let customRoleId: string | null = null;
    if (choice.startsWith("custom:")) {
      customRoleId = choice.slice("custom:".length);
      const { data: cr } = await supabase
        .from("rbac_roles")
        .select("base_role")
        .eq("id", customRoleId)
        .eq("org_id", orgId)
        .eq("is_system", false)
        .maybeSingle();
      if (!cr) return { error: "That custom role no longer exists." };
      role = cr.base_role as AppRole;
    } else if (!["admin", "hr", "manager", "employee"].includes(role)) {
      return { error: "Invalid role." };
    }

    const { userId: newUserId } = await createAppUserLogin(supabase, { orgId, actorUserId: userId, identifier, password, role, employeeId });
    if (customRoleId) {
      const { error } = await supabase.from("app_users").update({ custom_role_id: customRoleId }).eq("id", newUserId).eq("org_id", orgId);
      if (error) return { error: `Login created, but the custom role could not be applied: ${error.message}` };
    }

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create login." };
  }
}

export async function updateUserRoleAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const { supabase, userId, orgId } = await requireAdmin();
    const targetUserId = String(formData.get("user_id"));
    const choice = String(formData.get("role"));

    // "hr" (built-in) or "custom:<role id>".
    let newRole: AppRole | null = null;
    let customRoleId: string | null = null;
    if (choice.startsWith("custom:")) {
      customRoleId = choice.slice("custom:".length);
      const { data: cr } = await supabase
        .from("rbac_roles")
        .select("id, base_role")
        .eq("id", customRoleId)
        .eq("org_id", orgId)
        .eq("is_system", false)
        .maybeSingle();
      if (!cr) return { error: "That custom role no longer exists." };
      newRole = cr.base_role as AppRole;
    } else {
      newRole = choice as AppRole;
      if (!["admin", "hr", "manager", "employee"].includes(newRole)) return { error: "Invalid role." };
    }

    if (targetUserId === userId && newRole !== "admin") {
      const { count } = await supabase.from("app_users").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return { error: "You're the only admin — promote someone else to admin before changing your own role." };
      }
    }

    const { data: before } = await supabase.from("app_users").select("role, custom_role_id").eq("id", targetUserId).maybeSingle();

    // Picking a built-in role clears any custom role; picking a custom role
    // sets it (the database aligns the legacy role to its base role).
    const { error: updateErr } = await supabase
      .from("app_users")
      .update({ role: newRole, custom_role_id: customRoleId })
      .eq("id", targetUserId)
      .eq("org_id", orgId);
    if (updateErr) return { error: updateErr.message };

    await recordAuditEvent(supabase, {
      orgId,
      actorUserId: userId,
      action: "user_role_changed",
      resourceType: "app_user",
      resourceId: targetUserId,
      eventCategory: "security",
      riskLevel: "elevated",
      before: { role: before?.role ?? null, custom_role_id: before?.custom_role_id ?? null },
      after: { role: newRole, custom_role_id: customRoleId },
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update role." };
  }
}

// ---- Custom roles -------------------------------------------------------
// A custom role is built on hr / manager / employee and starts as an exact
// copy of that role's permissions and menu; the admin then switches things
// OFF. It can never exceed its base role (enforced again in the database).
export async function createCustomRoleAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const { supabase, userId, orgId } = await requireAdmin();
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim() || null;
    const baseRole = String(formData.get("base_role") || "") as UserRole;

    const nameProblem = validateCustomRoleName(name);
    if (nameProblem) return { error: nameProblem };
    if (!["hr", "manager", "employee"].includes(baseRole)) return { error: "Pick HR, Manager or Employee as the base." };

    const code = customRoleCode(name);
    const { data: existing } = await supabase.from("rbac_roles").select("id").eq("org_id", orgId).eq("code", code).maybeSingle();
    if (existing) return { error: "A role with that name already exists." };

    const { data: base } = await supabase
      .from("rbac_roles")
      .select("id")
      .eq("org_id", orgId)
      .eq("code", baseRole)
      .eq("is_system", true)
      .maybeSingle();
    if (!base) return { error: `The built-in ${baseRole} role isn't set up for this organisation yet.` };

    const { data: created, error: createErr } = await supabase
      .from("rbac_roles")
      .insert({ org_id: orgId, code, name, description, is_system: false, base_role: baseRole })
      .select("id")
      .single();
    if (createErr || !created) return { error: createErr?.message ?? "Could not create the role." };

    // Copy the base role's grants.
    const { data: baseGrants } = await supabase.from("rbac_role_permissions").select("permission_id, scope").eq("role_id", base.id);
    if (baseGrants && baseGrants.length > 0) {
      const { error } = await supabase
        .from("rbac_role_permissions")
        .insert(baseGrants.map((g) => ({ role_id: created.id, permission_id: g.permission_id, scope: g.scope })));
      if (error) {
        await supabase.from("rbac_roles").delete().eq("id", created.id);
        return { error: error.message };
      }
    }

    // Copy the base role's menu visibility.
    const { data: baseModules } = await supabase.from("role_module_permissions").select("module_key, can_view").eq("org_id", orgId).eq("role", baseRole);
    const visibleByKey = new Map((baseModules ?? []).map((m) => [m.module_key, m.can_view]));
    const defaults = new Set(DEFAULT_VISIBLE_MODULES[baseRole]);
    const moduleRows = ALL_MODULES.map((m) => ({
      role_id: created.id,
      module_key: m.key,
      can_view: baseModules && baseModules.length > 0 ? visibleByKey.get(m.key) ?? false : defaults.has(m.key),
    }));
    const { error: modErr } = await supabase.from("rbac_role_modules").insert(moduleRows);
    if (modErr) {
      await supabase.from("rbac_roles").delete().eq("id", created.id);
      return { error: modErr.message };
    }

    await recordAuditEvent(supabase, {
      orgId,
      actorUserId: userId,
      action: "rbac.custom_role_created",
      resourceType: "rbac_role",
      resourceId: created.id,
      eventCategory: "security",
      riskLevel: "elevated",
      after: { name, code, base_role: baseRole },
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create role." };
  }
}

export async function deleteCustomRoleAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const { supabase, userId, orgId } = await requireAdmin();
    const roleId = String(formData.get("role_id") || "");
    const { data: role } = await supabase
      .from("rbac_roles")
      .select("id, name, base_role")
      .eq("id", roleId)
      .eq("org_id", orgId)
      .eq("is_system", false)
      .maybeSingle();
    if (!role) return { error: "Custom role not found." };

    const { count } = await supabase.from("app_users").select("id", { count: "exact", head: true }).eq("custom_role_id", roleId);

    // People on it fall back to the built-in role it was based on.
    const { error } = await supabase.from("rbac_roles").delete().eq("id", roleId).eq("org_id", orgId);
    if (error) return { error: error.message };

    await recordAuditEvent(supabase, {
      orgId,
      actorUserId: userId,
      action: "rbac.custom_role_deleted",
      resourceType: "rbac_role",
      resourceId: roleId,
      eventCategory: "security",
      riskLevel: "high",
      before: { name: role.name, base_role: role.base_role, users_affected: count ?? 0 },
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete role." };
  }
}

export async function toggleCustomRoleModuleAction(formData: FormData) {
  const { supabase, userId, orgId } = await requireAdmin();
  const roleId = String(formData.get("role_id") || "");
  const moduleKey = String(formData.get("module_key") || "");
  const canView = formData.get("can_view") === "true";
  if (!roleId || !moduleKey) throw new Error("Missing role or module.");
  if (moduleKey === "dashboard") throw new Error("The dashboard is always available.");
  if (!ALL_MODULES.some((m) => m.key === moduleKey)) throw new Error("Unknown module.");

  const { data: role } = await supabase.from("rbac_roles").select("id").eq("id", roleId).eq("org_id", orgId).eq("is_system", false).maybeSingle();
  if (!role) throw new Error("Custom role not found.");

  const { error } = await supabase.from("rbac_role_modules").upsert({ role_id: roleId, module_key: moduleKey, can_view: canView }, { onConflict: "role_id,module_key" });
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: canView ? "rbac.module_enabled" : "rbac.module_disabled",
    resourceType: "rbac_role",
    resourceId: roleId,
    eventCategory: "security",
    riskLevel: "elevated",
    after: { module: moduleKey, can_view: canView },
  });

  revalidatePath("/dashboard/settings");
}

// Revokes app access by removing the app_users row (the person's Supabase
// Auth login itself is untouched, so this is reversible by re-adding them
// here — deleting their auth account outright is a heavier, harder-to-undo
// action this screen deliberately doesn't offer).
export async function removeUserAccessAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const { supabase, userId, orgId } = await requireAdmin();
    const targetUserId = String(formData.get("user_id"));

    if (targetUserId === userId) return { error: "You can't remove your own access." };

    const { data: target } = await supabase.from("app_users").select("role").eq("id", targetUserId).eq("org_id", orgId).maybeSingle();
    if (!target) return { error: "User not found." };

    const { error: deleteErr } = await supabase.from("app_users").delete().eq("id", targetUserId).eq("org_id", orgId);
    if (deleteErr) return { error: deleteErr.message };

    await recordAuditEvent(supabase, {
      orgId,
      actorUserId: userId,
      action: "user_access_removed",
      resourceType: "app_user",
      resourceId: targetUserId,
      eventCategory: "security",
      riskLevel: "high",
      before: { role: target.role },
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove access." };
  }
}
