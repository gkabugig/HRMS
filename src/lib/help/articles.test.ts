import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_ARTICLES, articlesForRole } from "./articles";

describe("help articles", () => {
  it("have unique ids and at least one step", () => {
    const ids = HELP_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of HELP_ARTICLES) expect(a.steps.length).toBeGreaterThan(0);
  });

  it("only link to pages that exist", () => {
    for (const a of HELP_ARTICLES.filter((x) => x.href)) {
      const page = join(process.cwd(), "src/app", a.href!, "page.tsx");
      expect(existsSync(page), `${a.id} -> ${a.href}`).toBe(true);
    }
  });

  it("gives every role something, and keeps manager and admin-only content apart", () => {
    expect(articlesForRole("manager").some((a) => a.id === "run-payroll")).toBe(false);
    expect(articlesForRole("hr").some((a) => a.id === "create-login")).toBe(false);
    expect(articlesForRole("admin").some((a) => a.id === "create-login")).toBe(true);
    expect(articlesForRole("manager").length).toBeGreaterThan(0);
  });
});
