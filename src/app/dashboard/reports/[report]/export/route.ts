import { createClient } from "@/lib/supabase/server";
import { findReport } from "@/lib/report-engine/catalogue";
import { parseFilters } from "@/lib/report-engine/filters";
import { runReport } from "@/lib/report-engine/load";
import { reportToCsv, reportToXlsx } from "@/lib/report-engine/export";
import { kenyaToday } from "@/lib/recruitment/application";

// Downloads a report with exactly the filters chosen on screen. The same
// permission rules as the on-screen view apply, and rows come through the
// signed-in user's own session, so row-level security still decides what is in it.
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report: key } = await params;
  const def = findReport(key);
  if (!def) return new Response("Unknown report.", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user.id).maybeSingle();
  const isHr = appUser?.role === "admin" || appUser?.role === "hr";
  const isManager = appUser?.role === "manager";
  if (!appUser || (!isHr && !(isManager && !def.hrOnly))) return new Response("Not authorised.", { status: 403 });

  const url = new URL(request.url);
  const today = kenyaToday();
  const filters = parseFilters(
    {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      department: url.searchParams.get("department") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    },
    today
  );

  let report;
  try {
    report = await runReport(supabase, appUser.org_id, def.key, filters, today);
  } catch {
    return new Response("The report could not be built.", { status: 500 });
  }

  const name = `${def.key}-${filters.from}_to_${filters.to}`;
  if (url.searchParams.get("format") === "xlsx") {
    const bytes = reportToXlsx(report);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  }
  return new Response(reportToCsv(report), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
