import { describe, expect, it } from "vitest";
import { monthDays, summariseMonth } from "./monthly";
import { toTemplateParam } from "../notifications/channels/whatsapp";

const shift = { start_time: "08:00", end_time: "22:00", grace_minutes: 15 };

describe("monthDays", () => {
  it("stops at today for the current month", () => {
    expect(monthDays("2026-10", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(monthDays("2026-02", "2026-12-01")).toHaveLength(28);
  });
});

describe("summariseMonth", () => {
  const base = {
    people: [{ id: "e1", name: "Ann", staffNo: "C001", branch: "Branch 001" }],
    days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
    today: "2026-10-04",
    holidays: new Set<string>(),
    shifts: new Map([["e1", shift]]),
  };

  it("counts late minutes, absence, leave and today without calling it absent", () => {
    const [r] = summariseMonth({
      ...base,
      attendance: [
        { employee_id: "e1", work_date: "2026-10-01", clock_in: "08:30:00", clock_out: "22:00:00" },
        { employee_id: "e1", work_date: "2026-10-04", clock_in: "08:05:00", clock_out: null },
      ],
      breaks: [{ employee_id: "e1", work_date: "2026-10-01", started_at: "2026-10-01T10:00:00Z", ended_at: "2026-10-01T11:00:00Z" }],
      leave: [{ employee_id: "e1", start_date: "2026-10-03", end_date: "2026-10-03" }],
    });
    expect(r.daysWorked).toBe(2);
    expect(r.lateDays).toBe(1);
    expect(r.minutesLate).toBe(30);
    expect(r.absentDays).toBe(1); // 2 Oct
    expect(r.leaveDays).toBe(1);
    expect(r.missingClockOuts).toBe(0); // today is still open
    // 08:30-22:00 = 13.5 h, minus a 1 h lunch = 12.5 h; shift is 14 h so no overtime.
    expect(r.hoursWorked).toBe(12.5);
    expect(r.overtimeHours).toBe(0);
  });
});

describe("WhatsApp template parameter", () => {
  it("removes line breaks Meta rejects", () => {
    expect(toTemplateParam("a\nb\tc")).toBe("a | b | c");
  });
});
