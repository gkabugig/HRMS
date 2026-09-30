"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createAppUserLogin, type AppRole } from "@/lib/auth/provision-user";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

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
    org_id: DEFAULT_ORG_ID,
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
    { org_id: DEFAULT_ORG_ID, role, module_key: moduleKey, can_view: canView },
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

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const role = String(formData.get("role") || "") as AppRole;
    const employeeId = String(formData.get("employee_id") || "") || null;

    if (!email) return { error: "Email is required." };
    if (password.length < 8) return { error: "Password must be at least 8 characters." };
    if (!["admin", "hr", "manager", "employee"].includes(role)) return { error: "Invalid role." };

    await createAppUserLogin(supabase, { orgId, actorUserId: userId, email, password, role, employeeId });

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
    const newRole = String(formData.get("role")) as AppRole;
    if (!["admin", "hr", "manager", "employee"].includes(newRole)) return { error: "Invalid role." };

    if (targetUserId === userId && newRole !== "admin") {
      const { count } = await supabase.from("app_users").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return { error: "You're the only admin — promote someone else to admin before changing your own role." };
      }
    }

    const { data: before } = await supabase.from("app_users").select("role").eq("id", targetUserId).maybeSingle();

    const { error: updateErr } = await supabase.from("app_users").update({ role: newRole }).eq("id", targetUserId).eq("org_id", orgId);
    if (updateErr) return { error: updateErr.message };

    await recordAuditEvent(supabase, {
      orgId,
      actorUserId: userId,
      action: "user_role_changed",
      resourceType: "app_user",
      resourceId: targetUserId,
      eventCategory: "security",
      riskLevel: "elevated",
      before: { role: before?.role ?? null },
      after: { role: newRole },
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update role." };
  }
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
