import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Dashboard code must write into the signed-in user's own organisation
// (requireOrgId), never a hard-coded id - otherwise a second organisation's
// users would write into, or be refused by, the first one. The sign-up
// bootstrap on the login form is the one legitimate use of the default id.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("no hard-coded organisation id in dashboard code", () => {
  it("finds none", () => {
    const root = join(__dirname, "../../src/app/dashboard");
    const offenders = walk(root).filter((f) => readFileSync(f, "utf8").includes("00000000-0000-0000-0000-000000000001"));
    expect(offenders).toEqual([]);
  });
});
