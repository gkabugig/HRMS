// Server helpers: file a letter when an outcome is committed, and notify.
import { createNotification } from "@/lib/notifications/create-notification";
import type { Db } from "./context";

export async function fileLetter(db: Db, i: { orgId: string; employeeId: string; type: string; title: string; body: string; recommendationId?: string; promotionCaseId?: string }) {
  await db.from("reward_letters").upsert(
    { org_id: i.orgId, employee_id: i.employeeId, recommendation_id: i.recommendationId ?? null, promotion_case_id: i.promotionCaseId ?? null, letter_type: i.type, title: i.title, body: i.body },
    { onConflict: i.recommendationId ? "recommendation_id" : "promotion_case_id", ignoreDuplicates: true }
  );
}

async function userOfEmployee(db: Db, employeeId: string): Promise<string | null> {
  const { data } = await db.from("app_users").select("id").eq("employee_id", employeeId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function hrUserIds(db: Db, orgId: string): Promise<string[]> {
  const { data } = await db.from("app_users").select("id").eq("org_id", orgId).in("role", ["admin", "hr"]);
  return (data ?? []).map((u) => u.id as string);
}

// Notifications never break the business action behind them.
export async function notifyRewards(
  db: Db,
  i: { orgId: string; userIds: (string | null)[]; type: string; category?: "performance" | "payroll"; title: string; message: string; entityType: string; entityId: string; actionUrl: string }
) {
  for (const uid of i.userIds) {
    if (!uid) continue;
    try {
      await createNotification(db, { orgId: i.orgId, recipientUserId: uid, type: i.type, category: i.category ?? "performance", priority: "information", title: i.title, message: i.message, entityType: i.entityType, entityId: i.entityId, actionUrl: i.actionUrl });
    } catch {
      /* ignore */
    }
  }
}

export async function notifyEmployee(db: Db, orgId: string, employeeId: string, n: { type: string; category?: "performance" | "payroll"; title: string; message: string; entityType: string; entityId: string; actionUrl: string }) {
  await notifyRewards(db, { orgId, userIds: [await userOfEmployee(db, employeeId)], ...n });
}

// Spec §16: HR is told when a pool reaches 90% or goes over budget.
export async function checkPoolAlert(db: Db, orgId: string, poolId: string | null) {
  if (!poolId) return;
  const { data: p } = await db.from("reward_pool_status").select("id, name, approved_budget, committed").eq("id", poolId).maybeSingle();
  if (!p || Number(p.approved_budget) <= 0) return;
  const used = Number(p.committed) / Number(p.approved_budget);
  if (used < 0.9) return;
  await notifyRewards(db, { orgId, userIds: await hrUserIds(db, orgId), type: used > 1 ? "REWARD_POOL_OVER" : "REWARD_POOL_90", title: used > 1 ? `${p.name} is over budget` : `${p.name} is at ${Math.round(used * 100)}% of budget`, message: "Review the pool before approving more rewards.", entityType: "reward_pool", entityId: p.id as string, actionUrl: "/dashboard/rewards" });
}

// Tells employees about letters whose release date has arrived (once each).
export async function notifyDueLetters(db: Db, orgId?: string): Promise<number> {
  let q = db.from("reward_letters").select("id, org_id, employee_id, title").is("notified_at", null).not("release_date", "is", null).lte("release_date", new Date().toISOString().slice(0, 10));
  if (orgId) q = q.eq("org_id", orgId);
  const { data } = await q;
  for (const l of data ?? []) {
    await notifyEmployee(db, l.org_id as string, l.employee_id as string, { type: "REWARD_RELEASED", title: "Your reward letter is ready", message: `${l.title as string} is now available in My Rewards.`, entityType: "reward_letter", entityId: l.id as string, actionUrl: "/dashboard/me/rewards" });
    await db.from("reward_letters").update({ notified_at: new Date().toISOString() }).eq("id", l.id as string);
  }
  return (data ?? []).length;
}
