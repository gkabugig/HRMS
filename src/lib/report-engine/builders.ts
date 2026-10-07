// Pure report builders: plain rows in, a finished ReportResult out. No
// database or framework code here, so every figure is unit tested.
import { calculateLeaveDays } from "../leave/calculate-leave-days";
import { isLateClockIn } from "../reports";
import { buildRecruitmentReport } from "../recruitment/report";
import { periodLabel } from "./filters";
import type {
  AttendanceRow, CandidateRow, ComplianceRow, DisciplinaryRow, EmployeeRow, EnrollmentRow, HistoryRow,
  LeaveRow, OffboardingRow, PayslipRow, ReportFilters, ReportResult, RequisitionRow,
} from "./types";

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const pct = (n: number, d: number) => (d > 0 ? round1((n / d) * 100) : 0);
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
const inRange = (d: string | null | undefined, f: ReportFilters) => !!d && d >= f.from && d <= f.to;
const empLink = (id: string) => `/dashboard/employees/${id}`;

export function employeeMatches(e: Pick<EmployeeRow, "department" | "employment_type">, f: ReportFilters): boolean {
  return (!f.department || e.department === f.department) && (!f.employmentType || e.employment_type === f.employmentType);
}

function countMap<T>(xs: T[], key: (x: T) => string): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

const base = (key: string, title: string, description: string, f: ReportFilters) => ({
  key, title, description, periodLabel: periodLabel(f), notes: [] as string[],
});

// ------------------------------------------------------------------ headcount
export function buildHeadcount(employees: EmployeeRow[], f: ReportFilters, today: string): ReportResult {
  const scoped = employees.filter((e) => employeeMatches(e, f));
  const active = scoped.filter((e) => e.status === "Active");
  const tenure = (e: EmployeeRow) => round1(daysBetween(e.date_of_hire, today) / 365.25);
  const joiners = scoped.filter((e) => inRange(e.date_of_hire, f));
  return {
    ...base("headcount", "Headcount and tenure", "Everyone currently employed, with how long they have served.", f),
    stats: [
      { label: "Active staff", value: String(active.length) },
      { label: "Average service", value: active.length ? `${round1(sum(active, tenure) / active.length)} yrs` : "—" },
      { label: "Joined in period", value: String(joiners.length) },
      { label: "Under 1 year's service", value: String(active.filter((e) => tenure(e) < 1).length) },
    ],
    chart: { title: "Active staff by department", items: countMap(active, (e) => e.department) },
    columns: [
      { key: "staff_no", label: "Staff no" }, { key: "name", label: "Name" }, { key: "department", label: "Department" },
      { key: "job_title", label: "Job title" }, { key: "type", label: "Type" }, { key: "hired", label: "Date hired" },
      { key: "tenure", label: "Service (yrs)", align: "right", format: "decimal" },
    ],
    rows: active
      .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
      .map((e) => ({
        href: empLink(e.id),
        cells: { staff_no: e.staff_no, name: e.name, department: e.department, job_title: e.job_title, type: e.employment_type, hired: e.date_of_hire, tenure: tenure(e) },
      })),
  };
}

// ------------------------------------------------------------------- turnover
export function headcountAt(employees: EmployeeRow[], leaveDate: Map<string, string>, date: string): number {
  return employees.filter((e) => e.date_of_hire <= date && !(leaveDate.has(e.id) && leaveDate.get(e.id)! <= date)).length;
}

export function buildTurnover(employees: EmployeeRow[], offboarding: OffboardingRow[], f: ReportFilters): ReportResult {
  const scoped = employees.filter((e) => employeeMatches(e, f));
  const byId = new Map(scoped.map((e) => [e.id, e]));
  const leaveDate = new Map<string, string>();
  for (const o of offboarding) if (byId.has(o.employee_id)) leaveDate.set(o.employee_id, o.last_working_day);

  const leavers = offboarding.filter((o) => byId.has(o.employee_id) && inRange(o.last_working_day, f));
  const joiners = scoped.filter((e) => inRange(e.date_of_hire, f));
  const startHc = headcountAt(scoped, leaveDate, f.from);
  const endHc = headcountAt(scoped, leaveDate, f.to);
  const avgHc = (startHc + endHc) / 2;
  const tenureAtExit = leavers.map((o) => daysBetween(byId.get(o.employee_id)!.date_of_hire, o.last_working_day) / 365.25);
  const interviews = leavers.filter((o) => o.exit_interview_completed).length;

  return {
    ...base("turnover", "Turnover and exits", "Who left in the period, why, and what that means for staff turnover.", f),
    stats: [
      { label: "Leavers", value: String(leavers.length), tone: leavers.length ? "amber" : undefined },
      { label: "Joiners", value: String(joiners.length) },
      { label: "Turnover rate", value: avgHc ? `${pct(leavers.length, avgHc)}%` : "—", hint: "Leavers ÷ average headcount over the period" },
      { label: "Average service at exit", value: tenureAtExit.length ? `${round1(sum(tenureAtExit, (x) => x) / tenureAtExit.length)} yrs` : "—" },
      { label: "Exit interviews done", value: leavers.length ? `${pct(interviews, leavers.length)}%` : "—" },
      { label: "Headcount start → end", value: `${startHc} → ${endHc}` },
    ],
    chart: { title: "Exits by type", items: countMap(leavers, (o) => o.exit_type) },
    columns: [
      { key: "name", label: "Name" }, { key: "department", label: "Department" }, { key: "exit_type", label: "Exit type" },
      { key: "notice", label: "Notice given" }, { key: "last_day", label: "Last working day" },
      { key: "service", label: "Service (yrs)", align: "right", format: "decimal" },
      { key: "interview", label: "Exit interview" }, { key: "severance", label: "Severance", align: "right", format: "kes" },
    ],
    rows: leavers
      .sort((a, b) => (a.last_working_day < b.last_working_day ? 1 : -1))
      .map((o) => {
        const e = byId.get(o.employee_id)!;
        return {
          href: empLink(e.id),
          cells: {
            name: e.name, department: e.department, exit_type: o.exit_type, notice: o.notice_date, last_day: o.last_working_day,
            service: round1(daysBetween(e.date_of_hire, o.last_working_day) / 365.25),
            interview: o.exit_interview_completed ? "Done" : "Not done", severance: o.severance_pay ?? 0,
          },
        };
      }),
    notes: ["Turnover rate is for the period you chose, not annualised."],
  };
}

// ----------------------------------------------------------------- attendance
function overlapDays(from: string, to: string, f: { from: string; to: string }, holidays: Set<string>): number {
  const s = from > f.from ? from : f.from;
  const e = to < f.to ? to : f.to;
  return s > e ? 0 : calculateLeaveDays(s, e, holidays);
}

export function buildAttendance(
  employees: EmployeeRow[], attendance: AttendanceRow[], leave: LeaveRow[], holidays: Set<string>, f: ReportFilters, today: string
): ReportResult {
  const active = employees.filter((e) => e.status === "Active" && employeeMatches(e, f));
  const end = f.to < today ? f.to : today;
  const perEmp = active.map((e) => {
    const start = e.date_of_hire > f.from ? e.date_of_hire : f.from;
    const expected = start > end ? 0 : calculateLeaveDays(start, end, holidays);
    const mine = attendance.filter((a) => a.employee_id === e.id && a.clock_in && inRange(a.work_date, f));
    const late = mine.filter((a) => isLateClockIn(a.clock_in)).length;
    const missing = mine.filter((a) => !a.clock_out).length;
    const onLeave = sum(
      leave.filter((l) => l.employee_id === e.id && l.status === "Approved"),
      (l) => overlapDays(l.start_date, l.end_date, { from: start, to: end }, holidays)
    );
    const absent = Math.max(0, expected - onLeave - mine.length);
    return { e, expected, present: mine.length, late, missing, onLeave, absent };
  });

  const totExpected = sum(perEmp, (p) => Math.max(0, p.expected - p.onLeave));
  const totPresent = sum(perEmp, (p) => p.present);
  const repeatLate = perEmp.filter((p) => p.late >= 3).length;

  return {
    ...base("attendance", "Attendance, lateness and absence", "Who was present, late or absent, with repeat lateness flagged.", f),
    stats: [
      { label: "Attendance rate", value: totExpected ? `${Math.min(100, pct(totPresent, totExpected))}%` : "—", hint: "Days present ÷ days expected, leave excluded" },
      { label: "Late arrivals", value: String(sum(perEmp, (p) => p.late)) },
      { label: "Staff late 3+ times", value: String(repeatLate), tone: repeatLate ? "amber" : undefined },
      { label: "Absent days (no leave)", value: String(sum(perEmp, (p) => p.absent)), tone: sum(perEmp, (p) => p.absent) ? "red" : undefined },
      { label: "Missing clock-outs", value: String(sum(perEmp, (p) => p.missing)) },
    ],
    chart: {
      title: "Late arrivals by department",
      items: [...new Map(perEmp.map((p) => [p.e.department, 0])).keys()]
        .map((d) => ({ label: d, value: sum(perEmp.filter((p) => p.e.department === d), (p) => p.late) }))
        .filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
    },
    columns: [
      { key: "name", label: "Name" }, { key: "department", label: "Department" },
      { key: "expected", label: "Days expected", align: "right", format: "int" }, { key: "present", label: "Present", align: "right", format: "int" },
      { key: "leave", label: "On leave", align: "right", format: "int" }, { key: "absent", label: "Absent", align: "right", format: "int" },
      { key: "late", label: "Late", align: "right", format: "int" }, { key: "missing", label: "No clock-out", align: "right", format: "int" },
    ],
    rows: perEmp
      .sort((a, b) => b.late - a.late || b.absent - a.absent)
      .map((p) => ({
        href: empLink(p.e.id),
        cells: { name: p.e.name, department: p.e.department, expected: p.expected, present: p.present, leave: p.onLeave, absent: p.absent, late: p.late, missing: p.missing },
      })),
    notes: [
      "Late means clocking in after 08:15. Weekends and public holidays are not counted as working days.",
      "Absent = working days with no clock-in and no approved leave.",
    ],
  };
}

// ---------------------------------------------------------------------- leave
export function buildLeave(
  employees: EmployeeRow[], entitlements: Record<string, number>, requests: LeaveRow[], f: ReportFilters
): ReportResult {
  const year = f.to.slice(0, 4);
  const active = employees.filter((e) => e.status === "Active" && employeeMatches(e, f));
  const inYear = requests.filter((r) => r.start_date.startsWith(year));
  const annualEntitlement = entitlements["Annual"] ?? 0;

  const perEmp = active.map((e) => {
    const mine = inYear.filter((r) => r.employee_id === e.id);
    const taken = (t: string) => sum(mine.filter((r) => r.leave_type === t && r.status === "Approved"), (r) => r.days);
    const annualTaken = taken("Annual");
    const otherTaken = sum(mine.filter((r) => r.leave_type !== "Annual" && r.status === "Approved"), (r) => r.days);
    const pending = sum(mine.filter((r) => r.leave_type === "Annual" && r.status === "Pending"), (r) => r.days);
    const remaining = Math.max(0, annualEntitlement - annualTaken);
    return { e, annualTaken, otherTaken, pending, remaining, value: (remaining * e.basic) / 30 };
  });

  const takenInPeriod = requests.filter((r) => r.status === "Approved" && inRange(r.start_date, f));
  const byType = new Map<string, number>();
  for (const r of takenInPeriod) byType.set(r.leave_type, (byType.get(r.leave_type) ?? 0) + r.days);

  return {
    ...base("leave", "Leave taken and balances", `Leave days taken in the period and each person's Annual leave balance for ${year}.`, f),
    stats: [
      { label: "Leave days taken", value: String(sum(takenInPeriod, (r) => r.days)) },
      { label: "Requests waiting", value: String(requests.filter((r) => r.status === "Pending").length), tone: requests.some((r) => r.status === "Pending") ? "amber" : undefined },
      { label: "Annual days unused", value: String(round1(sum(perEmp, (p) => p.remaining))) },
      { label: "Estimated value of unused leave", value: kes(sum(perEmp, (p) => p.value)), hint: "Unused days × basic pay ÷ 30" },
    ],
    chart: { title: "Approved leave days by type (period)", items: [...byType.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) },
    columns: [
      { key: "name", label: "Name" }, { key: "department", label: "Department" },
      { key: "entitlement", label: "Annual entitlement", align: "right", format: "int" }, { key: "taken", label: "Annual taken", align: "right", format: "decimal" },
      { key: "pending", label: "Annual pending", align: "right", format: "decimal" }, { key: "remaining", label: "Annual remaining", align: "right", format: "decimal" },
      { key: "other", label: "Other leave taken", align: "right", format: "decimal" }, { key: "value", label: "Value of unused", align: "right", format: "kes" },
    ],
    rows: perEmp
      .sort((a, b) => b.remaining - a.remaining)
      .map((p) => ({
        href: empLink(p.e.id),
        cells: { name: p.e.name, department: p.e.department, entitlement: annualEntitlement, taken: p.annualTaken, pending: p.pending, remaining: p.remaining, other: p.otherTaken, value: Math.round(p.value) },
      })),
    notes: ["Balances are for the calendar year of the end date and do not model carry-forward. The money value is an estimate for budgeting, not a payroll figure."],
  };
}

// -------------------------------------------------------------------- payroll
function slipsFor(slips: PayslipRow[], emp: Map<string, EmployeeRow>, f: ReportFilters): PayslipRow[] {
  const p0 = f.from.slice(0, 7);
  const p1 = f.to.slice(0, 7);
  return slips.filter((s) => s.period >= p0 && s.period <= p1 && emp.has(s.employee_id) && employeeMatches(emp.get(s.employee_id)!, f));
}

export function buildPayroll(employees: EmployeeRow[], slips: PayslipRow[], f: ReportFilters): ReportResult {
  const emp = new Map(employees.map((e) => [e.id, e]));
  const rows = slipsFor(slips, emp, f);
  const periods = [...new Set(rows.map((s) => s.period))].sort();
  const per = periods.map((p) => {
    const x = rows.filter((s) => s.period === p);
    const gross = sum(x, (s) => s.gross);
    const employer = sum(x, (s) => s.employer_nssf + s.employer_housing_levy);
    return {
      period: p, staff: x.length, gross, paye: sum(x, (s) => s.paye), nssf: sum(x, (s) => s.nssf), shif: sum(x, (s) => s.shif),
      levy: sum(x, (s) => s.housing_levy), other: sum(x, (s) => s.other_deductions), net: sum(x, (s) => s.net), employer, cost: gross + employer,
    };
  });
  const latest = per[per.length - 1];
  return {
    ...base("payroll", "Payroll cost by month", "What payroll cost each month: pay, deductions and what the employer adds on top.", f),
    stats: [
      { label: "Months covered", value: String(per.length) },
      { label: "Total gross pay", value: kes(sum(per, (p) => p.gross)) },
      { label: "Total net pay", value: kes(sum(per, (p) => p.net)) },
      { label: "Total cost to employer", value: kes(sum(per, (p) => p.cost)), hint: "Gross pay + employer NSSF + employer housing levy" },
      { label: "Latest month: average gross", value: latest && latest.staff ? kes(latest.gross / latest.staff) : "—" },
    ],
    chart: { title: "Cost to employer per month", items: per.map((p) => ({ label: p.period, value: Math.round(p.cost) })), format: "kes" },
    columns: [
      { key: "period", label: "Month" }, { key: "staff", label: "Staff paid", align: "right", format: "int" },
      { key: "gross", label: "Gross", align: "right", format: "kes" }, { key: "paye", label: "PAYE", align: "right", format: "kes" },
      { key: "nssf", label: "NSSF", align: "right", format: "kes" }, { key: "shif", label: "SHIF", align: "right", format: "kes" },
      { key: "levy", label: "Housing levy", align: "right", format: "kes" }, { key: "other", label: "Other deductions", align: "right", format: "kes" },
      { key: "net", label: "Net pay", align: "right", format: "kes" }, { key: "employer", label: "Employer contributions", align: "right", format: "kes" },
      { key: "cost", label: "Total cost", align: "right", format: "kes" },
    ],
    rows: per.map((p) => ({ cells: { ...p, gross: Math.round(p.gross), paye: Math.round(p.paye), nssf: Math.round(p.nssf), shif: Math.round(p.shif), levy: Math.round(p.levy), other: Math.round(p.other), net: Math.round(p.net), employer: Math.round(p.employer), cost: Math.round(p.cost) } })),
  };
}

export function buildPayrollByDepartment(employees: EmployeeRow[], slips: PayslipRow[], f: ReportFilters): ReportResult {
  const emp = new Map(employees.map((e) => [e.id, e]));
  const rows = slipsFor(slips, emp, f);
  const depts = [...new Set(rows.map((s) => emp.get(s.employee_id)!.department))];
  const per = depts.map((d) => {
    const x = rows.filter((s) => emp.get(s.employee_id)!.department === d);
    const gross = sum(x, (s) => s.gross);
    const employer = sum(x, (s) => s.employer_nssf + s.employer_housing_levy);
    const people = new Set(x.map((s) => s.employee_id)).size;
    return { department: d, people, gross, employer, cost: gross + employer };
  }).sort((a, b) => b.cost - a.cost);
  const total = sum(per, (p) => p.cost);
  return {
    ...base("payroll-department", "Payroll cost by department", "Where the pay bill goes, department by department.", f),
    stats: [
      { label: "Total cost to employer", value: kes(total) },
      { label: "Departments", value: String(per.length) },
      { label: "Biggest cost centre", value: per[0] ? `${per[0].department} (${pct(per[0].cost, total)}%)` : "—" },
    ],
    chart: { title: "Cost to employer by department", items: per.map((p) => ({ label: p.department, value: Math.round(p.cost) })), format: "kes" },
    columns: [
      { key: "department", label: "Department" }, { key: "people", label: "People paid", align: "right", format: "int" },
      { key: "gross", label: "Gross pay", align: "right", format: "kes" }, { key: "employer", label: "Employer contributions", align: "right", format: "kes" },
      { key: "cost", label: "Total cost", align: "right", format: "kes" }, { key: "share", label: "Share", align: "right", format: "pct" },
      { key: "avg", label: "Average gross per person", align: "right", format: "kes" },
    ],
    rows: per.map((p) => ({ cells: { department: p.department, people: p.people, gross: Math.round(p.gross), employer: Math.round(p.employer), cost: Math.round(p.cost), share: pct(p.cost, total), avg: p.people ? Math.round(p.gross / p.people / Math.max(1, new Set(rows.map((s) => s.period)).size)) : 0 } })),
    notes: ["Average gross per person is per month, averaged over the months covered."],
  };
}

// Statutory remittances: what has to be paid over to KRA, NSSF and SHA each month.
export function remittanceDue(period: string, component: string): string {
  const [y, m] = period.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const day = component === "NSSF" ? 15 : 9;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function buildStatutory(employees: EmployeeRow[], slips: PayslipRow[], f: ReportFilters): ReportResult {
  const emp = new Map(employees.map((e) => [e.id, e]));
  const rows = slipsFor(slips, emp, f);
  const periods = [...new Set(rows.map((s) => s.period))].sort();
  const out: { period: string; component: string; employee: number; employer: number; total: number; due: string }[] = [];
  for (const p of periods) {
    const x = rows.filter((s) => s.period === p);
    const lines: [string, number, number][] = [
      ["PAYE", sum(x, (s) => s.paye), 0],
      ["NSSF", sum(x, (s) => s.nssf), sum(x, (s) => s.employer_nssf)],
      ["SHIF", sum(x, (s) => s.shif), 0],
      ["Housing levy", sum(x, (s) => s.housing_levy), sum(x, (s) => s.employer_housing_levy)],
    ];
    for (const [component, employee, employer] of lines) {
      out.push({ period: p, component, employee: Math.round(employee), employer: Math.round(employer), total: Math.round(employee + employer), due: remittanceDue(p, component) });
    }
  }
  const byComponent = new Map<string, number>();
  for (const o of out) byComponent.set(o.component, (byComponent.get(o.component) ?? 0) + o.total);
  return {
    ...base("statutory", "Statutory remittances", "What must be paid to KRA, NSSF and SHA for each month, and by when.", f),
    stats: [
      { label: "Total to remit", value: kes(sum(out, (o) => o.total)) },
      ...[...byComponent.entries()].map(([label, value]) => ({ label, value: kes(value) })),
    ],
    chart: { title: "Total by component", items: [...byComponent.entries()].map(([label, value]) => ({ label, value })), format: "kes" },
    columns: [
      { key: "period", label: "Payroll month" }, { key: "component", label: "Component" },
      { key: "employee", label: "From employees", align: "right", format: "kes" }, { key: "employer", label: "From employer", align: "right", format: "kes" },
      { key: "total", label: "Total to remit", align: "right", format: "kes" }, { key: "due", label: "Usual due date" },
    ],
    rows: out.map((o) => ({ cells: o })),
    notes: ["Due dates shown are the usual ones (the 9th for PAYE, SHIF and housing levy; the 15th for NSSF, in the following month). Confirm against the current KRA, SHA and NSSF guidance before paying."],
  };
}

// ----------------------------------------------------------------- compliance
export function buildCompliance(employees: EmployeeRow[], docs: ComplianceRow[], f: ReportFilters, today: string): ReportResult {
  const emp = new Map(employees.map((e) => [e.id, e]));
  const rows = docs
    .filter((d) => (d.employee_id ? emp.has(d.employee_id) && employeeMatches(emp.get(d.employee_id)!, f) : !f.department && !f.employmentType))
    .map((d) => {
      const left = daysBetween(today, d.expiry_date);
      const status = left < 0 ? "Expired" : left <= d.alert_threshold_days ? "Expiring soon" : "Valid";
      return { d, left, status };
    })
    .sort((a, b) => a.left - b.left);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    ...base("compliance", "Compliance register", "Every tracked document, how long it has left, and what needs renewing.", f),
    stats: [
      { label: "Documents tracked", value: String(rows.length) },
      { label: "Expired", value: String(count("Expired")), tone: count("Expired") ? "red" : undefined },
      { label: "Expiring soon", value: String(count("Expiring soon")), tone: count("Expiring soon") ? "amber" : undefined },
      { label: "Valid", value: String(count("Valid")), tone: "green" },
    ],
    chart: { title: "By status", items: [{ label: "Expired", value: count("Expired") }, { label: "Expiring soon", value: count("Expiring soon") }, { label: "Valid", value: count("Valid") }] },
    columns: [
      { key: "who", label: "Employee" }, { key: "type", label: "Type" }, { key: "label", label: "Document" },
      { key: "expiry", label: "Expires" }, { key: "left", label: "Days left", align: "right", format: "int" }, { key: "status", label: "Status" },
    ],
    rows: rows.map((r) => ({
      href: r.d.employee_id ? empLink(r.d.employee_id) : undefined,
      cells: { who: r.d.employee_id ? emp.get(r.d.employee_id)?.name ?? "—" : "Organisation", type: r.d.doc_type, label: r.d.label, expiry: r.d.expiry_date, left: r.left, status: r.status },
    })),
    notes: ["This report shows the position today; the date range does not apply."],
  };
}

// ------------------------------------------------------------------- training
export function buildTraining(employees: EmployeeRow[], enrolments: EnrollmentRow[], f: ReportFilters): ReportResult {
  const emp = new Map(employees.map((e) => [e.id, e]));
  const rows = enrolments.filter((r) => emp.has(r.employee_id) && employeeMatches(emp.get(r.employee_id)!, f) && inRange(r.enrolled_on, f));
  const done = rows.filter((r) => r.status === "Completed");
  const mandatoryOpen = rows.filter((r) => r.mandatory && r.status !== "Completed");
  const byCourse = new Map<string, number>();
  for (const r of done) byCourse.set(r.course_name, (byCourse.get(r.course_name) ?? 0) + 1);
  return {
    ...base("training", "Training and development", "Who is enrolled, who has finished, and what is still outstanding.", f),
    stats: [
      { label: "Enrolments", value: String(rows.length) },
      { label: "Completion rate", value: rows.length ? `${pct(done.length, rows.length)}%` : "—" },
      { label: "Mandatory not completed", value: String(mandatoryOpen.length), tone: mandatoryOpen.length ? "amber" : undefined },
      { label: "Cost of completed training", value: kes(sum(done, (r) => r.cost)) },
    ],
    chart: { title: "Completions by course", items: [...byCourse.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10) },
    columns: [
      { key: "name", label: "Employee" }, { key: "department", label: "Department" }, { key: "course", label: "Course" },
      { key: "mandatory", label: "Mandatory" }, { key: "status", label: "Status" }, { key: "enrolled", label: "Enrolled" }, { key: "completed", label: "Completed" },
    ],
    rows: rows.sort((a, b) => (a.enrolled_on < b.enrolled_on ? 1 : -1)).map((r) => {
      const e = emp.get(r.employee_id)!;
      return { href: empLink(e.id), cells: { name: e.name, department: e.department, course: r.course_name, mandatory: r.mandatory ? "Yes" : "No", status: r.status, enrolled: r.enrolled_on, completed: r.completed_on } };
    }),
  };
}

// --------------------------------------------------------------- disciplinary
export function buildDisciplinary(employees: EmployeeRow[], actions: DisciplinaryRow[], f: ReportFilters): ReportResult {
  const emp = new Map(employees.map((e) => [e.id, e]));
  const rows = actions.filter((a) => emp.has(a.employee_id) && employeeMatches(emp.get(a.employee_id)!, f) && inRange(a.hearing_date, f));
  const perPerson = new Map<string, number>();
  for (const a of rows) perPerson.set(a.employee_id, (perPerson.get(a.employee_id) ?? 0) + 1);
  const repeat = [...perPerson.values()].filter((n) => n >= 2).length;
  return {
    ...base("disciplinary", "Disciplinary actions", "Hearings and outcomes in the period, with repeat cases flagged.", f),
    stats: [
      { label: "Actions", value: String(rows.length) },
      { label: "Staff with 2+ actions", value: String(repeat), tone: repeat ? "amber" : undefined },
      { label: "Departments involved", value: String(new Set(rows.map((a) => emp.get(a.employee_id)!.department)).size) },
    ],
    chart: { title: "Actions by type", items: countMap(rows, (a) => a.action_type) },
    columns: [
      { key: "date", label: "Hearing date" }, { key: "name", label: "Employee" }, { key: "department", label: "Department" },
      { key: "type", label: "Action" }, { key: "reason", label: "Reason" }, { key: "outcome", label: "Outcome" },
    ],
    rows: rows.sort((a, b) => (a.hearing_date < b.hearing_date ? 1 : -1)).map((a) => {
      const e = emp.get(a.employee_id)!;
      return { href: empLink(e.id), cells: { date: a.hearing_date, name: e.name, department: e.department, type: a.action_type, reason: a.reason, outcome: a.outcome } };
    }),
  };
}

// ---------------------------------------------------------------- recruitment
export function buildRecruitment(
  requisitions: RequisitionRow[], candidates: CandidateRow[], history: HistoryRow[], f: ReportFilters, today: string
): ReportResult {
  const reqs = requisitions.filter((r) => (!f.department || r.department === f.department) && (inRange(r.raised_on.slice(0, 10), f) || r.status === "Open"));
  const ids = new Set(reqs.map((r) => r.id));
  const cands = candidates.filter((c) => ids.has(c.requisition_id));
  const rep = buildRecruitmentReport(cands, history.filter((h) => cands.some((c) => c.id === h.candidate_id)));
  return {
    ...base("recruitment", "Recruitment", "Open and recent jobs, how many people applied, and how long hiring takes.", f),
    stats: [
      { label: "Open jobs", value: String(reqs.filter((r) => r.status === "Open" && r.approval_status === "Approved").length) },
      { label: "Candidates", value: String(rep.total) },
      { label: "Hired", value: String(rep.hired) },
      { label: "Average time to hire", value: rep.avgTimeToHireDays === null ? "—" : `${rep.avgTimeToHireDays} days` },
    ],
    chart: { title: "Hiring funnel", items: rep.funnel.map((x) => ({ label: x.stage, value: x.count })) },
    columns: [
      { key: "role", label: "Job" }, { key: "department", label: "Department" }, { key: "headcount", label: "Headcount", align: "right", format: "int" },
      { key: "status", label: "Status" }, { key: "candidates", label: "Candidates", align: "right", format: "int" },
      { key: "hired", label: "Hired", align: "right", format: "int" }, { key: "open_days", label: "Days open", align: "right", format: "int" },
    ],
    rows: reqs.map((r) => {
      const mine = cands.filter((c) => c.requisition_id === r.id);
      return {
        href: `/dashboard/recruitment/${r.id}`,
        cells: {
          role: r.role, department: r.department, headcount: r.headcount,
          status: r.approval_status === "Approved" ? r.status : r.approval_status === "Pending" ? "Awaiting approval" : "Declined",
          candidates: mine.length, hired: mine.filter((c) => c.stage === "Hired").length,
          open_days: r.status === "Open" ? daysBetween(r.raised_on.slice(0, 10), today) : null,
        },
      };
    }),
    notes: ["For the full funnel, sources and rejection reasons, open Recruitment → Reports."],
  };
}

// ------------------------------------------------------------------ diversity
export function ageBand(dob: string | null, today: string): string {
  if (!dob) return "Not recorded";
  const age = Math.floor(daysBetween(dob, today) / 365.25);
  if (age < 25) return "Under 25";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  if (age < 55) return "45–54";
  return "55 and over";
}

export function buildDiversity(employees: EmployeeRow[], f: ReportFilters, today: string): ReportResult {
  const active = employees.filter((e) => e.status === "Active" && employeeMatches(e, f));
  const total = active.length;
  const rows: { dimension: string; segment: string; count: number; share: number }[] = [];
  const add = (dimension: string, items: { label: string; value: number }[]) => {
    for (const i of items) rows.push({ dimension, segment: i.label, count: i.value, share: pct(i.value, total) });
  };
  const gender = countMap(active, (e) => e.gender?.trim() || "Not recorded");
  add("Gender", gender);
  add("Age", countMap(active, (e) => ageBand(e.date_of_birth, today)));
  add("Employment type", countMap(active, (e) => e.employment_type));
  const women = active.filter((e) => (e.gender ?? "").toLowerCase().startsWith("f")).length;
  const missingGender = active.filter((e) => !e.gender?.trim()).length;
  const ages = active.filter((e) => e.date_of_birth).map((e) => daysBetween(e.date_of_birth!, today) / 365.25);
  return {
    ...base("diversity", "Workforce profile", "Gender, age and employment mix of the active workforce.", f),
    stats: [
      { label: "Active staff", value: String(total) },
      { label: "Women", value: total ? `${pct(women, total)}%` : "—" },
      { label: "Average age", value: ages.length ? `${round1(sum(ages, (x) => x) / ages.length)}` : "—" },
      { label: "Gender not recorded", value: String(missingGender), tone: missingGender ? "amber" : undefined, hint: "Fill in the employee records to improve this report" },
    ],
    chart: { title: "Gender", items: gender },
    columns: [
      { key: "dimension", label: "Measure" }, { key: "segment", label: "Group" },
      { key: "count", label: "People", align: "right", format: "int" }, { key: "share", label: "Share", align: "right", format: "pct" },
    ],
    rows: rows.map((r) => ({ cells: r })),
    notes: ["Sensitive personal data. Share with care and only for legitimate purposes."],
  };
}
