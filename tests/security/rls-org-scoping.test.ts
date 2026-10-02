import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// P0 Security Hardening (SEC-001/SEC-005) regression guard.
//
// This repo has twice shipped an RLS policy shaped like
//   for all using (hrms_current_role() in ('admin','hr'))
// with NO organisation check at all - once across ~16 tables fixed in
// migration 0124, and the underlying bug class was first identified and
// fixed for a different set of tables back in migration 0025. Both times
// the policy *looked* complete (it does correctly gate by role) but silently
// let any admin/hr user in ANY organisation read/write every OTHER
// organisation's rows on that table, because hrms_current_role() only
// reports the caller's role, never which org they belong to.
//
// We don't have a live multi-tenant Supabase instance in CI to actually
// exercise this cross-org, so this is a static guard instead: it parses
// every migration file, reconstructs the final (post drop/create) set of
// RLS policies, and fails the build if any admin/hr-role policy's body has
// no org-scoping reference at all. It is intentionally a coarse textual
// check (not a SQL parser) - it exists to catch "someone copy-pasted the
// old unscoped shape for a new table" before it reaches production, not to
// prove every policy's join path is correct (that still needs human review,
// same as 0124/0125/0126/0127 got).
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");

type ParsedPolicy = {
  name: string;
  table: string;
  body: string;
  file: string;
};

function parseMigrations(): Map<string, ParsedPolicy> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // numeric filename prefixes keep this chronological

  const policies = new Map<string, ParsedPolicy>();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");

    // Policies this file drops no longer represent the live definition even
    // if an earlier file's CREATE still matches below - remove them first so
    // a later, unrelated migration's text can't accidentally resurrect a
    // stale entry.
    for (const m of sql.matchAll(/drop policy\s+"([^"]+)"\s+on\s+([\w.]+)/gi)) {
      const table = m[2].replace(/^public\./, "");
      policies.delete(`${m[1]}::${table}`);
    }

    // Non-greedy up to the next semicolon: every policy body in this schema
    // is a plain USING/WITH CHECK expression with no nested semicolons, so
    // this reliably captures one full CREATE POLICY statement.
    for (const m of sql.matchAll(/create policy\s+"([^"]+)"\s+on\s+([\w.]+)\s+([\s\S]*?);/gi)) {
      const [, name, rawTable, body] = m;
      const table = rawTable.replace(/^public\./, "");
      policies.set(`${name}::${table}`, { name, table, body, file });
    }
  }

  return policies;
}

describe("RLS policies: admin/hr policies must be org-scoped", () => {
  const policies = parseMigrations();

  it("finds a non-trivial number of policies (parser sanity check)", () => {
    // Guards against the regex silently matching nothing after a future
    // SQL formatting change and this test going green for the wrong reason.
    expect(policies.size).toBeGreaterThan(50);
  });

  const roleCheckPattern = /hrms_current_role\(\)\s*(?:=\s*'(?:admin|hr)'|in\s*\([^)]*'(?:admin|hr)'[^)]*\))/i;
  // Any of these establish that the policy ties back to the caller's
  // organisation, directly or via one of the recursion-safe SECURITY
  // DEFINER lookup helpers (0045: approval_request_org_id, etc.).
  const orgScopePattern = /current_org_id\(\)|org_id\s*=\s*current_org_id|_org_id\(/i;

  // Confirmed-safe exceptions, each verified by hand against its table's
  // schema - not exempted just because they'd otherwise fail:
  //   rbac_permissions has no org_id column at all (0033): it's a global
  //   resource/action/sensitivity catalog shared by every organisation
  //   (e.g. "employees"/"view"/"normal"), not tenant data, so there is
  //   nothing to scope. rbac_role_permissions, which actually grants a
  //   permission to a role, is scoped at the rbac_roles level instead.
  const KNOWN_SAFE_UNSCOPED = new Set(["rbac_permissions_admin_manage::rbac_permissions"]);

  const adminHrPolicies = Array.from(policies.values()).filter(
    (p) => roleCheckPattern.test(p.body) && !KNOWN_SAFE_UNSCOPED.has(`${p.name}::${p.table}`)
  );

  it("finds admin/hr-role policies to check (parser sanity check)", () => {
    expect(adminHrPolicies.length).toBeGreaterThan(10);
  });

  it.each(adminHrPolicies.map((p) => [`${p.name} on ${p.table} (${p.file})`, p] as const))(
    "%s is org-scoped",
    (_label, policy) => {
      expect(orgScopePattern.test(policy.body)).toBe(true);
    }
  );
});
