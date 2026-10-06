// Per-module access for custom roles. Pure functions (used by the request
// proxy, the layout and the Settings screen) so the rules are unit tested.
import { ALL_MODULES } from "./roles";

// The one module nobody can be locked out of - it is where denied people land.
export const ALWAYS_ALLOWED_MODULES = ["dashboard"];

// Which menu module a URL path belongs to: the module whose href is the
// longest prefix of the path. "/dashboard" itself only matches exactly, or
// every page would count as the dashboard.
export function moduleKeyForPath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: { key: string; len: number } | null = null;
  for (const m of ALL_MODULES) {
    const href = m.href;
    const matches = href === "/dashboard" ? path === href : path === href || path.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.len)) best = { key: m.key, len: href.length };
  }
  return best ? best.key : null;
}

// True when the path belongs to a module this role has been switched off for.
export function isPathBlocked(pathname: string, hiddenModuleKeys: Iterable<string>): boolean {
  const key = moduleKeyForPath(pathname);
  if (!key || ALWAYS_ALLOWED_MODULES.includes(key)) return false;
  for (const h of hiddenModuleKeys) if (h === key) return true;
  return false;
}

const SCOPE_RANK: Record<string, number> = {
  organisation: 6,
  business_unit: 5,
  department: 4,
  team: 3,
  direct_reports: 2,
  self: 1,
};

// Mirrors the database trigger: a custom role may hold a scope only if its
// base role holds that permission at the same or a wider scope.
export function scopeWithinCeiling(requested: string, baseScopes: Iterable<string>): boolean {
  const r = SCOPE_RANK[requested] ?? Infinity;
  for (const s of baseScopes) if ((SCOPE_RANK[s] ?? 0) >= r) return true;
  return false;
}

// "Payroll Officer" -> "custom_payroll_officer"
export function customRoleCode(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return `custom_${slug || "role"}`;
}

export function validateCustomRoleName(name: string): string | null {
  const n = name.trim();
  if (n.length < 3 || n.length > 40) return "Role name must be 3-40 characters.";
  if (!/[a-zA-Z0-9]/.test(n)) return "Role name needs letters or numbers.";
  return null;
}
