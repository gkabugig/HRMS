import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";
import type { LeaveView } from "@/lib/leave/leave-types";
import { availableLeaveViews, defaultLeaveView, canApproveLeave } from "@/lib/leave/leave-permissions";
import { getLeaveCalendar } from "@/lib/leave/get-leave-calendar";
import { getLeaveBalances } from "@/lib/leave/get-leave-balances";
import { LeaveToolbar, MonthNav } from "./components/leave-toolbar";
import { LeaveCalendar, LeaveLegend } from "./components/leave-calendar";
import { LeaveRequestList } from "./components/leave-request-list";
import { LeaveBalanceCard } from "./components/leave-balance-card";
import { LeaveRequestDialog } from "./components/leave-request-dialog";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const { view: viewParam, month: monthParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, org_id, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const role = (appUser?.role ?? "employee") as UserRole;
  const views = availableLeaveViews(role);
  const view = (views.includes(viewParam as LeaveView) ? viewParam : defaultLeaveView(role)) as LeaveView;
  const month = monthParam ?? currentMonth();
  const canDecide = canApproveLeave(role);

  const isCalendarView = view === "my" || view === "team" || view === "company";

  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const today = new Date().toISOString().slice(0, 10);

  let calendarEmployees: { id: string; name: string; department: string }[] = [];
  let leaveRequests: Awaited<ReturnType<typeof getLeaveCalendar>> = [];
  let holidayDates = new Set<string>();

  if (isCalendarView) {
    const [{ data: employees }, requests, { data: holidays }] = await Promise.all([
      view === "my" && appUser?.employee_id
        ? supabase.from("employees").select("id, name, department").eq("id", appUser.employee_id)
        : supabase.from("employees").select("id, name, department").eq("status", "Active").order("department").order("name"),
      getLeaveCalendar(supabase, monthStart, monthEnd),
      appUser
        ? supabase.from("public_holidays").select("holiday_date").eq("org_id", appUser.org_id).lte("holiday_date", monthEnd).gte("holiday_date", monthStart)
        : Promise.resolve({ data: [] as { holiday_date: string }[] }),
    ]);
    calendarEmployees = employees ?? [];
    leaveRequests = requests;
    holidayDates = new Set((holidays ?? []).map((h) => h.holiday_date));
  }

  let requestRows: Awaited<ReturnType<typeof getLeaveCalendar>> = [];
  if (view === "requests") {
    const { data } = await supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type, start_date, end_date, days, reason, status, applied_on, decided_on, employees(name, department, reporting_manager_id)")
      .order("applied_on", { ascending: false });
    requestRows = (data ?? []) as unknown as typeof requestRows;
  }

  let balances: Awaited<ReturnType<typeof getLeaveBalances>> = [];
  if (view === "balances" && appUser) {
    let employeeIds: string[] = [];
    if (role === "employee" || role === "manager") {
      const { data: scoped } = await supabase.from("employees").select("id");
      employeeIds = (scoped ?? []).map((e) => e.id);
    } else {
      const { data: scoped } = await supabase.from("employees").select("id").eq("status", "Active");
      employeeIds = (scoped ?? []).map((e) => e.id);
    }
    balances = await getLeaveBalances(supabase, appUser.org_id, employeeIds);
  }

  const awayToday = leaveRequests.filter((r) => r.status === "Approved" && r.start_date <= today && r.end_date >= today).length;
  const pendingCount = leaveRequests.filter((r) => r.status === "Pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Leave Calendar</h1>
          {isCalendarView && (
            <p className="text-xs text-neutral-500 mt-0.5">
              {calendarEmployees.length} employee{calendarEmployees.length === 1 ? "" : "s"} · {awayToday} currently away · {pendingCount} request{pendingCount === 1 ? "" : "s"} pending this month
            </p>
          )}
        </div>
        {appUser?.employee_id && <LeaveRequestDialog employeeId={appUser.employee_id} />}
      </div>

      <LeaveToolbar views={views} active={view} month={isCalendarView ? month : undefined} />

      {isCalendarView && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MonthNav view={view} month={month} />
            <LeaveLegend />
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-3">
            <LeaveCalendar employees={calendarEmployees} requests={leaveRequests} month={month} holidayDates={holidayDates} />
          </div>
        </div>
      )}

      {view === "requests" && <LeaveRequestList requests={requestRows} canDecide={canDecide} selfEmployeeId={appUser?.employee_id ?? null} />}

      {view === "balances" && <LeaveBalanceCard balances={balances} groupByEmployee={role !== "employee"} />}
    </div>
  );
}
