import { describe, expect, it } from "vitest";
import { summariseWeeks } from "./wellbeing";

describe("summariseWeeks", () => {
  it("hides the average when fewer than 5 people checked in", () => {
    const rows = [1, 2, 3, 4].map((m) => ({ week_start: "2026-10-05", mood: m }));
    expect(summariseWeeks(rows)).toEqual([{ weekStart: "2026-10-05", count: 4, average: null }]);
  });
  it("shows the average at 5 or more and sorts newest first", () => {
    const rows = [...[5, 4, 3, 4, 4].map((m) => ({ week_start: "2026-10-05", mood: m })), { week_start: "2026-09-28", mood: 2 }];
    const out = summariseWeeks(rows);
    expect(out[0]).toEqual({ weekStart: "2026-10-05", count: 5, average: 4 });
    expect(out[1].average).toBeNull();
  });
});
