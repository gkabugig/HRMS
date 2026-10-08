import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/create-notification";
import type { NotificationCategory } from "@/lib/notifications/notification-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any>;
export type Ctx = { supabase: Db; userId: string; orgId: string; role: string; employeeId: string | null };

// Who is calling, from the signed-in session only (never from a form).
export async function getCtx(): Promise<Ctx> {
  const supabase = (await createClient()) as Db;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: au } = await supabase.from("app_users").select("org_id, role, employee_id").eq("id", user.id).maybeSingle();
  if (!au) throw new Error("Your account is not set up yet.");
  return { supabase, userId: user.id, orgId: au.org_id as string, role: au.role as string, employeeId: (au.employee_id as string | null) ?? null };
}

// For pages: send a signed-out visitor to the login, anyone else gets their context.
export async function pageCtx(): Promise<Ctx> {
  try {
    return await getCtx();
  } catch {
    redirect("/login");
  }
}

export async function requireHrCtx(): Promise<Ctx> {
  const c = await getCtx();
  if (!["admin", "hr"].includes(c.role)) throw new Error("Only HR or an administrator can do this.");
  return c;
}

export async function requireEmployeeCtx(): Promise<Ctx & { employeeId: string }> {
  const c = await getCtx();
  if (!c.employeeId) throw new Error("Your login isn't linked to an employee record.");
  return c as Ctx & { employeeId: string };
}

export const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function userIdsWhere(db: Db, orgId: string, roles?: string[]): Promise<string[]> {
  let q = db.from("app_users").select("id").eq("org_id", orgId);
  if (roles) q = q.in("role", roles);
  const { data } = await q.limit(1000);
  return (data ?? []).map((u) => u.id as string);
}

// Notifications never break the action behind them.
export async function notify(
  db: Db,
  i: { orgId: string; userIds: (string | null)[]; type: string; category?: NotificationCategory; title: string; message: string; entityType: string; entityId: string; actionUrl: string }
) {
  for (const uid of i.userIds) {
    if (!uid) continue;
    try {
      await createNotification(db, { orgId: i.orgId, recipientUserId: uid, type: i.type, category: i.category ?? "system", priority: "information", title: i.title, message: i.message, entityType: i.entityType, entityId: i.entityId, actionUrl: i.actionUrl });
    } catch {
      /* ignore */
    }
  }
}
