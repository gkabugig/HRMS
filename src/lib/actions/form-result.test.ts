import { describe, expect, it } from "vitest";
import { toResult } from "./form-result";

describe("toResult", () => {
  it("reports success", async () => {
    expect(await toResult(async () => {})).toEqual({ success: true });
  });
  it("returns the message of an expected failure instead of throwing", async () => {
    expect(await toResult(async () => { throw new Error("Enter both latitude and longitude."); })).toEqual({
      error: "Enter both latitude and longitude.",
    });
  });
  it("falls back to a friendly message", async () => {
    expect(await toResult(async () => { throw "boom"; })).toEqual({ error: "Something went wrong. Please try again." });
  });
});
