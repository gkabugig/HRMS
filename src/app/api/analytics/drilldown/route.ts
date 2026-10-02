import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeWorkforceMetrics } from "@/lib/intelligence/metrics/compute-metrics";
import { getManagerScope } from "@/lib/manager/get-manager-scope";

// Area 10 §5.6 drill-down contract: KPI -> Organisation -> Department ->
// Team -> Authorised employee population -> Source transaction. Every
// level re-checks authorization; aggregate visibility never implies
// row-level visibility. Without a `department` query param this returns
// the department-level breakdown (aggregate, same as the dashboard
// segment tables); with one, it re-authorizes and returns the underlying
// employee population for that department — admin/hr unconditionally,
// a manager only for departments inside their resolved scope (§6 Area 04
// scope resolver, same one every manager-workspace query uses). "Source
// transaction" (the innermost level) is not generalised here — it would
// mean a different underlying table per metric (an attendance row, a
// payslip, an offboarding record); only headcount's population list
// (employee rows) is wired for now, disclosed as the current scope.
const DEPARTMENT_SEGMENT_METRICS = new Set(["headcount_active", "payroll_cost_gross", "attendance_presence_rate"]);

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, org_id, employee_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const metricKey = searchParams.get("metric_key");
  const department = searchParams.get("department");
  if (!metricKey || !DEPARTMENT_SEGMENT_METRICS.has(metricKey)) {
    return NextResponse.json({ error: "metric_key must be one of: " + Array.from(DEPARTMENT_SEGMENT_METRICS).join(", ") }, { status: 400 });
  }

  const isAdminOrHr = ["admin", "hr"].includes(appUser.role);
  if (!isAdminOrHr && appUser.role !== "manager") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!department) {
    if (!isAdminOrHr) return NextResponse.json({ error: "Department breakdown requires HR/admin; managers must specify a department." }, { status: 403 });
    const metrics = await computeWorkforceMetrics(supabase, appUser.org_id);
    const segmentField =
      metricKey === "headcount_active" ? metrics.headcountByDepartment : metricKey === "payroll_cost_gross" ? metrics.costByDepartment : metrics.presenceByDepartment;
    return NextResponse.json({ level: "department", breakdown: segmentField });
  }

  // SEC-003: a manager was previously authorised for a department as soon
  // as ANY one of their in-scope employees happened to sit in it (the
  // `authorised` check below), but the query that followed then returned
  // the entire department's population unfiltered - every active employee
  // in that department, not just the ones inside the manager's own scope.
  // A manager with a single direct report in "Engineering" could pull the
  // names/staff numbers/status of everyone else in Engineering too. The fix
  // keeps the same authorisation gate (being in-scope for the department at
  // all is still what unlocks drilling into it) but additionally filters
  // the returned population to the manager's own scope.employeeIds, same as
  // every other manager-workspace query in this codebase already does.
  let scopeEmployeeIds: string[] | null = null;
  if (!isAdminOrHr) {
    const scope = await getManagerScope(supabase, appUser.employee_id as string, appUser.org_id);
    const { data: deptEmployees } = await supabase.from("employees").select("id").eq("org_id", appUser.org_id).eq("department", department);
    const deptIds = new Set((deptEmployees ?? []).map((e) => e.id));
    const authorised = scope.scopeTier === "organisation" || Array.from(deptIds).some((id) => scope.employeeIds.includes(id));
    if (!authorised) return NextResponse.json({ error: "Department is outside your authorised scope." }, { status: 403 });
    if (scope.scopeTier !== "organisation") scopeEmployeeIds = scope.employeeIds;
  }

  let employeeQuery = supabase
    .from("employees")
    .select("id, name, staff_no, status")
    .eq("org_id", appUser.org_id)
    .eq("department", department)
    .eq("status", "Active");
  if (scopeEmployeeIds) employeeQuery = employeeQuery.in("id", scopeEmployeeIds);
  const { data: employees } = await employeeQuery;

  return NextResponse.json({ level: "employee_population", department, population: employees ?? [] });
}
