import { describe, it, expect } from "vitest";
import { parseFilters, presetRange, clampRange } from "./filters";
import {
  buildHeadcount, buildTurnover, buildAttendance, buildLeave, buildPayroll, buildPayrollByDepartment,
  buildStatutory, remittanceDue, buildCompliance, buildTraining, buildDisciplinary, buildDiversity, ageBand,
} from "./builders";
import { crc32, reportToCsv, reportToXlsx, formatCell, zipStore } from "./export";
import type { EmployeeRow, ReportFilters, PayslipRow } from "./types";

const emp = (o: Partial<EmployeeRow> & { id: string }): EmployeeRow => ({
  staff_no: o.id, name: `Emp ${o.id}`, department: "Admin", job_title: "Clerk", employment_type: "Permanent",
  date_of_hire: "2020-01-01", status: "Active", gender: null, date_of_birth: null, basic: 30000, ...o,
});
const F: ReportFilters = { from: "2026-01-01", to: "2026-06-30", department: null, employmentType: null };
const TODAY = "2026-10-07";

describe("filters", () => {
  it("falls back to this year and fixes reversed or invalid dates", () => {
    expect(parseFilters({}, TODAY)).toEqual({ from: "2026-01-01", to: TODAY, department: null, employmentType: null });
    expect(parseFilters({ from: "2026-05-01", to: "2026-02-01" }, TODAY)).toMatchObject({ from: "2026-02-01", to: "2026-05-01" });
    expect(parseFilters({ from: "nope", to: "2026-13-45" }, TODAY)).toMatchObject({ from: "2026-01-01", to: TODAY });
    expect(parseFilters({ department: " Finance ", type: "Contract" }, TODAY)).toMatchObject({ department: "Finance", employmentType: "Contract" });
  });
  it("computes presets and clamps long ranges", () => {
    expect(presetRange("last-month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("this-quarter", TODAY)).toEqual({ from: "2026-10-01", to: TODAY });
    expect(presetRange("last-90", TODAY).from).toBe("2026-07-10");
    const c = clampRange({ ...F, from: "2025-01-01", to: "2026-06-30" }, 92);
    expect(c.clamped).toBe(true);
    expect(c.filters.from).toBe("2026-03-31");
    expect(clampRange(F, 400).clamped).toBe(false);
  });
});

describe("headcount, turnover, diversity", () => {
  const people = [
    emp({ id: "1", date_of_hire: "2019-01-01" }),
    emp({ id: "2", department: "Sales", date_of_hire: "2026-03-01", gender: "Female", date_of_birth: "1996-01-01" }),
    emp({ id: "3", date_of_hire: "2021-01-01", status: "Terminated", gender: "Male" }),
  ];
  it("counts only active staff and joiners in range", () => {
    const r = buildHeadcount(people, F, TODAY);
    expect(r.rows).toHaveLength(2);
    expect(r.stats[2].value).toBe("1"); // joiners in period
    expect(buildHeadcount(people, { ...F, department: "Sales" }, TODAY).rows).toHaveLength(1);
  });
  it("calculates turnover on average headcount", () => {
    const off = [{ employee_id: "3", exit_type: "Resignation", notice_date: "2026-03-01", last_working_day: "2026-04-01", exit_interview_completed: true, severance_pay: 0 }];
    const r = buildTurnover(people, off, F);
    expect(r.stats[0].value).toBe("1"); // leavers
    // start HC (1 Jan): emp1 + emp3 = 2; end HC (30 Jun): emp1 + emp2 = 2 -> avg 2 -> 50%
    expect(r.stats[2].value).toBe("50%");
    expect(r.rows[0].cells.exit_type).toBe("Resignation");
  });
  it("profiles gender and flags missing data", () => {
    const r = buildDiversity(people, F, TODAY);
    expect(r.stats.find((s) => s.label === "Women")!.value).toBe("50%");
    expect(r.stats.find((s) => s.label === "Gender not recorded")!.value).toBe("1");
    expect(ageBand("1996-01-01", TODAY)).toBe("25–34");
    expect(ageBand(null, TODAY)).toBe("Not recorded");
  });
});

describe("attendance and leave", () => {
  const people = [emp({ id: "1", date_of_hire: "2026-01-01" })];
  const f = { ...F, from: "2026-09-07", to: "2026-09-11" }; // Mon-Fri
  it("separates present, late, leave and absent days", () => {
    const att = [
      { employee_id: "1", work_date: "2026-09-07", clock_in: "08:00", clock_out: "17:00" },
      { employee_id: "1", work_date: "2026-09-08", clock_in: "09:30", clock_out: null }, // late, no clock-out
    ];
    const leave = [{ employee_id: "1", leave_type: "Annual", start_date: "2026-09-09", end_date: "2026-09-09", days: 1, status: "Approved" }];
    const r = buildAttendance(people, att, leave, new Set(), f, TODAY);
    expect(r.rows[0].cells).toMatchObject({ expected: 5, present: 2, leave: 1, absent: 2, late: 1, missing: 1 });
  });
  it("values unused annual leave at basic / 30", () => {
    const reqs = [{ employee_id: "1", leave_type: "Annual", start_date: "2026-02-02", end_date: "2026-02-06", days: 5, status: "Approved" }];
    const r = buildLeave(people.map((p) => ({ ...p, basic: 60000 })), { Annual: 21 }, reqs, F);
    expect(r.rows[0].cells).toMatchObject({ taken: 5, remaining: 16, value: 32000 });
  });
});

describe("payroll and statutory", () => {
  const people = [emp({ id: "1" }), emp({ id: "2", department: "Sales" })];
  const slip = (employee_id: string, period: string, gross: number): PayslipRow => ({
    period, employee_id, gross, nssf: 100, shif: 200, housing_levy: 300, paye: 400, other_deductions: 0, net: gross - 1000, employer_nssf: 100, employer_housing_levy: 300,
  });
  const slips = [slip("1", "2026-02", 50000), slip("2", "2026-02", 70000), slip("1", "2026-03", 50000), slip("1", "2025-12", 1)];
  it("sums per month inside the range only", () => {
    const r = buildPayroll(people, slips, F);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].cells).toMatchObject({ period: "2026-02", staff: 2, gross: 120000, employer: 800, cost: 120800 });
  });
  it("splits cost by department with shares", () => {
    const r = buildPayrollByDepartment(people, slips, F);
    expect(r.rows.map((x) => x.cells.department)).toEqual(["Admin", "Sales"]);
    expect(Number(r.rows[0].cells.share) + Number(r.rows[1].cells.share)).toBeGreaterThan(99);
  });
  it("lists remittances with due dates", () => {
    const r = buildStatutory(people, slips, { ...F, from: "2026-02-01", to: "2026-02-28" });
    expect(r.rows).toHaveLength(4);
    const nssf = r.rows.find((x) => x.cells.component === "NSSF")!;
    expect(nssf.cells).toMatchObject({ employee: 200, employer: 200, total: 400, due: "2026-03-15" });
    expect(remittanceDue("2026-12", "PAYE")).toBe("2027-01-09");
  });
  it("filters payroll by department", () => {
    const r = buildPayroll(people, slips, { ...F, department: "Sales" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].cells.gross).toBe(70000);
  });
});

describe("compliance, training, disciplinary", () => {
  const people = [emp({ id: "1" })];
  it("classifies document status", () => {
    const docs = [
      { employee_id: "1", doc_type: "Permit", label: "Work permit", expiry_date: "2026-09-01", alert_threshold_days: 30 },
      { employee_id: "1", doc_type: "Cert", label: "First aid", expiry_date: "2026-10-20", alert_threshold_days: 30 },
      { employee_id: null, doc_type: "Licence", label: "Business licence", expiry_date: "2027-06-01", alert_threshold_days: 30 },
    ];
    const r = buildCompliance(people, docs, F, TODAY);
    expect(r.rows.map((x) => x.cells.status)).toEqual(["Expired", "Expiring soon", "Valid"]);
    expect(r.rows[2].cells.who).toBe("Organisation");
  });
  it("reports training completion and outstanding mandatory courses", () => {
    const en = [
      { employee_id: "1", course_name: "Fire safety", mandatory: true, cost: 5000, status: "Completed", enrolled_on: "2026-02-01", completed_on: "2026-02-10" },
      { employee_id: "1", course_name: "Data privacy", mandatory: true, cost: 3000, status: "Enrolled", enrolled_on: "2026-03-01", completed_on: null },
    ];
    const r = buildTraining(people, en, F);
    expect(r.stats[1].value).toBe("50%");
    expect(r.stats[2].value).toBe("1");
    expect(r.stats[3].value).toContain("5,000");
  });
  it("flags repeat disciplinary cases", () => {
    const a = [
      { employee_id: "1", hearing_date: "2026-02-01", action_type: "Verbal warning", reason: "Lateness", outcome: null },
      { employee_id: "1", hearing_date: "2026-04-01", action_type: "Written warning", reason: "Lateness", outcome: null },
    ];
    expect(buildDisciplinary(people, a, F).stats[1].value).toBe("1");
  });
});

describe("export", () => {
  const r = buildHeadcount([emp({ id: "1", name: 'Smith, "Jo"' })], F, TODAY);
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("writes csv with labels and escaping", () => {
    const csv = reportToCsv(r);
    expect(csv.split("\n")[0]).toContain("Staff no");
    expect(csv).toContain('"Smith, ""Jo"""');
  });
  it("writes a zip-based xlsx package", () => {
    const bytes = reportToXlsx(r);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect(zipStore([{ name: "a.txt", data: "hi" }]).length).toBeGreaterThan(30);
  });
  it("formats cells for display", () => {
    expect(formatCell(1234.5, "kes")).toContain("1,23");
    expect(formatCell(null, "int")).toBe("—");
    expect(formatCell(12.5, "pct")).toBe("12.5%");
  });
});
