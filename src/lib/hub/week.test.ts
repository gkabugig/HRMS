import { describe, expect, it } from "vitest";
import { addDays, inWeek, isIsoDate, sumHours, weekDays, weekStartOf } from "./week";

describe("weeks", () => {
  it("finds the Monday of any day", () => {
    expect(weekStartOf("2026-10-08")).toBe("2026-10-05"); // Thursday
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(weekStartOf("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29"); // crosses the year
  });
  it("lists seven days and checks membership", () => {
    const d = weekDays("2026-10-05");
    expect(d).toHaveLength(7);
    expect(d[6]).toBe("2026-10-11");
    expect(inWeek("2026-10-05", "2026-10-11")).toBe(true);
    expect(inWeek("2026-10-05", "2026-10-12")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("validates dates and adds hours without drift", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-10-05")).toBe(true);
    expect(isIsoDate("5/10/2026")).toBe(false);
    expect(sumHours([7.5, "0.1", 0.2])).toBe(7.8);
  });
});
