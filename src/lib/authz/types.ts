// Universal RBAC — shared TypeScript types mirroring the Postgres enums
// created in supabase/migrations/0033_universal_rbac_foundation.sql.
// Keep these in sync with the DB enums by hand (small, stable sets).

export type RbacResource =
  | "employees"
  | "payroll"
  | "leave"
  | "attendance"
  | "performance"
  | "documents"
  | "recruitment"
  | "service_requests"
  | "audit"
  | "settings"
  | "rbac";

export type RbacAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "reject"
  | "export"
  | "manage";

export type RbacScope =
  | "organisation"
  | "business_unit"
  | "department"
  | "team"
  | "direct_reports"
  | "self";

export type RbacSensitivity = "normal" | "confidential" | "highly_restricted";

export type AuthorizeDeniedReason = "NO_ORGANISATION" | "PERMISSION_DENIED";

export type AuthorizeResult =
  | { allowed: true; scopes: RbacScope[] }
  | { allowed: false; reason: AuthorizeDeniedReason; scopes?: RbacScope[] };
