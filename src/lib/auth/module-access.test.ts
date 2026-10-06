import { describe, expect, it } from "vitest";
import { customRoleCode, isPathBlocked, moduleKeyForPath, scopeWithinCeiling, validateCustomRoleName } from "./module-access";

describe("moduleKeyForPath", () => {
  it("matches a module and its sub-pages", () => {
    expect(moduleKeyForPath("/dashboard/payroll")).toBe("payroll");
    expect(moduleKeyForPath("/dashboard/payroll/abc/output/bank_file")).toBe("payroll");
    expect(moduleKeyForPath("/dashboard/employees/123")).toBe("employees");
  });
  it("prefers the most specific module", () => {
    expect(moduleKeyForPath("/dashboard/notifications/admin")).toBe("notifications-admin");
    expect(moduleKeyForPath("/dashboard/notifications")).toBe("notifications");
    expect(moduleKeyForPath("/dashboard/manager/leave")).toBe("manager-leave");
  });
  it("treats /dashboard as the dashboard only when exact", () => {
    expect(moduleKeyForPath("/dashboard")).toBe("dashboard");
    expect(moduleKeyForPath("/dashboard/")).toBe("dashboard");
    expect(moduleKeyForPath("/dashboard/unknown-page")).toBeNull();
  });
  it("does not confuse look-alike prefixes", () => {
    expect(moduleKeyForPath("/dashboard/payrollx")).toBeNull();
  });
});

describe("isPathBlocked", () => {
  it("blocks only hidden modules", () => {
    expect(isPathBlocked("/dashboard/payroll/x", ["payroll"])).toBe(true);
    expect(isPathBlocked("/dashboard/leave", ["payroll"])).toBe(false);
  });
  it("never blocks the dashboard", () => {
    expect(isPathBlocked("/dashboard", ["dashboard"])).toBe(false);
  });
});

describe("scopeWithinCeiling", () => {
  it("allows equal or narrower scopes only", () => {
    expect(scopeWithinCeiling("self", ["direct_reports"])).toBe(true);
    expect(scopeWithinCeiling("direct_reports", ["direct_reports"])).toBe(true);
    expect(scopeWithinCeiling("organisation", ["direct_reports"])).toBe(false);
    expect(scopeWithinCeiling("self", [])).toBe(false);
  });
});

describe("custom role names", () => {
  it("builds a safe code", () => {
    expect(customRoleCode("Payroll Officer")).toBe("custom_payroll_officer");
    expect(customRoleCode("  HR -- Lead!! ")).toBe("custom_hr_lead");
  });
  it("validates names", () => {
    expect(validateCustomRoleName("ab")).not.toBeNull();
    expect(validateCustomRoleName("Payroll Officer")).toBeNull();
    expect(validateCustomRoleName("!!!!")).not.toBeNull();
  });
});
