// Workforce Intelligence (spec §7). Decision-oriented analytics: headcount
// trend, department mix, employment type mix, tenure, turnover — computed
// from `employees` + `offboarding_records`, nothing duplicated.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardContext, WorkforceAnalytics } from "./dashboard-types";

function monthsBack(n: number): { label: string; monthStart: Date }[] {
  const out: { label: string; monthStart: Date }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ label: d.toLocaleDateString("en-KE", { month: "short", year: "2-digit" }), monthStart: d });
  }
  return out;
}

export async function getWorkforceAnalytics(
  supabase: SupabaseClient,
  context: DashboardContext,
  orgEmployeeIds: string[]
): Promise<WorkforceAnalytics> {
  if (orgEmployeeIds.length === 0) {
    return {
      headcountTrend: [],
      departmentBreakdown: [],
      employmentTypeMix: [],
      tenureDistribution: [],
      turnoverRate12mo: null,
      totalActive: 0,
      totalAtStartOf12moWindow: 0,
    };
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("id, department, employment_type, date_of_hire, status")
    .in("id", orgEmployeeIds);

  const { data: exits } = await supabase
    .from("offboarding_records")
    .select("employee_id, last_working_day")
    .in("employee_id", orgEmployeeIds);

  const active = (employees ?? []).filter((e) => e.status === "Active");

  // Department breakdown (active only).
  const deptMap = new Map<string, number>();
  for (const e of active) deptMap.set(e.department, (deptMap.get(e.department) ?? 0) + 1);
  const departmentBreakdown = Array.from(deptMap.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);

  // Employment type mix (active only).
  const typeMap = new Map<string, number>();
  for (const e of active) typeMap.set(e.employment_type, (typeMap.get(e.employment_type) ?? 0) + 1);
  const employmentTypeMix = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));

  // Tenure distribution (active only), in years.
  const now = new Date(context.today);
  const buckets = { "<1yr": 0, "1-3yrs": 0, "3-5yrs": 0, "5+yrs": 0 };
  for (const e of active) {
    const hired = new Date(e.date_of_hire);
    const years = (now.getTime() - hired.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years < 1) buckets["<1yr"]++;
    else if (years < 3) buckets["1-3yrs"]++;
    else if (years < 5) buckets["3-5yrs"]++;
    else buckets["5+yrs"]++;
  }
  const tenureDistribution = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

  // Headcount trend: for each of the last 12 months, how many employees
  // were active (hired on/before the month start, and not yet exited).
  const months = monthsBack(12);
  const exitDates = new Map<string, Date>();
  for (const ex of exits ?? []) {
    if (ex.last_working_day) exitDates.set(ex.employee_id, new Date(ex.last_working_day));
  }
  const headcountTrend = months.map(({ label, monthStart }) => {
    const count = (employees ?? []).filter((e) => {
      const hired = new Date(e.date_of_hire);
      if (hired > monthStart) return false;
      const exitedOn = exitDates.get(e.id);
      if (exitedOn && exitedOn <= monthStart) return false;
      return true;
    }).length;
    return { label, value: count };
  });

  const totalAtStartOf12moWindow = headcountTrend[0]?.value ?? active.length;

  // Rolling 12-month turnover: exits in the last 12 months / average headcount.
  const yearAgo = new Date(context.today);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const exits12mo = (exits ?? []).filter((ex) => ex.last_working_day && new Date(ex.last_working_day) >= yearAgo).length;
  const avgHeadcount = (totalAtStartOf12moWindow + active.length) / 2;
  const turnoverRate12mo = avgHeadcount > 0 ? Math.round((exits12mo / avgHeadcount) * 1000) / 10 : null;

  return {
    headcountTrend,
    departmentBreakdown,
    employmentTypeMix,
    tenureDistribution,
    turnoverRate12mo,
    totalActive: active.length,
    totalAtStartOf12moWindow,
  };
}
