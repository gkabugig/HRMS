"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { generateForecast, type ForecastType } from "./generate-forecast";

async function requireAdminOrHr(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    throw new Error("Only admin/HR can generate workforce forecasts.");
  }
  return { userId: user.id, orgId: appUser.org_id as string };
}

export async function runForecast(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const forecastType = formData.get("forecast_type") as ForecastType;
  const result = await generateForecast(supabase, orgId, forecastType, userId);
  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "forecast.generated",
    resourceType: "analytics_forecast_runs",
    resourceId: result.runId,
    eventCategory: "configuration",
    metadata: { forecast_type: forecastType, blocked: result.blocked },
  });
  revalidatePath("/dashboard/analytics/forecasts");
}
