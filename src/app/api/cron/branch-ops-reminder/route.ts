import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/hub/context";
import { cronUnauthorized } from "@/lib/branch-ops/cron-auth";
import { runReminderJob } from "@/lib/branch-ops/jobs";

// Branch Operations scheduled job (see vercel.json for the time).
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  return NextResponse.json(await runReminderJob(createAdminClient() as Db));
}
