// Shared user-provisioning logic (Settings -> Manage Users, and the
// Employees screen's "Invite to ESS" action). Creating a login requires
// the Auth Admin API (service_role key — see lib/supabase/admin.ts) since
// the anon key a normal session uses can't create another person's auth
// account.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

export type AppRole = "admin" | "hr" | "manager" | "employee";

export async function createAppUserLogin(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    actorUserId: string;
    email: string;
    password: string;
    role: AppRole;
    employeeId: string | null;
  }
): Promise<{ userId: string }> {
  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true, // no email-sending configured yet — the admin hands the password over directly
  });
  if (createErr) throw new Error(createErr.message);
  if (!created.user) throw new Error("User creation did not return a user.");

  const { error: insertErr } = await supabase.from("app_users").insert({
    id: created.user.id,
    org_id: input.orgId,
    role: input.role,
    employee_id: input.employeeId,
  });
  if (insertErr) {
    // Roll back the orphaned auth account rather than leaving a login with
    // no role/org — it would otherwise sit in Supabase Auth forever with
    // no way to use the app and no row for an admin to find and fix.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw new Error(insertErr.message);
  }

  await recordAuditEvent(supabase, {
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "user_login_created",
    resourceType: "app_user",
    resourceId: created.user.id,
    eventCategory: "security",
    riskLevel: "elevated",
    metadata: { email: input.email, role: input.role, employee_id: input.employeeId },
  });

  return { userId: created.user.id };
}
