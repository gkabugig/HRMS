// Plain constant, kept out of profile-change-actions.ts ("use server") since
// a Server Actions file may only export async functions — this needs to be
// importable from a client component (the field <select> options).
//
// Area 05 §5 extends this with two more groups, both still routed through
// the exact same profile_change_requests table + apply_profile_change
// workflow action (both already field-agnostic):
//   - NORMAL_FIELDS: unchanged from the original self-service pass, plus the
//     new emergency-contact/next-of-kin columns (migration 0064) — spec's
//     "View/edit if policy permits ... Controlled request" field groups.
//   - HIGH_SENSITIVITY_FIELDS: bank/national/statutory IDs — spec §5's
//     "Masked view" + "High-sensitivity request + verification + approval"
//     / "Restricted request + evidence + HR approval" field groups. These
//     still go through the identical HR-approval workflow graph (there is
//     only ever one approver step — see supabase/migrations/0041), but
//     submission requires an evidence document and the request is flagged
//     sensitivity='highly_restricted' so decideProfileChangeApproval checks
//     that RBAC tier rather than 'normal' — confirmed via the live
//     rbac_permissions seed to be the tier actually granted to admin/hr on
//     employees/edit (migration 0068; 'confidential' is a real RBAC tier
//     elsewhere — employees/view, documents/*, performance/* — but is not
//     granted on employees/edit in this seed, which made it an unapprovable
//     dead end when used here).
export const NORMAL_FIELDS = [
  "personal_email",
  "phone_number",
  "physical_address",
  "postal_address",
  "marital_status",
  "nationality",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  "next_of_kin_name",
  "next_of_kin_phone",
  "next_of_kin_relationship",
] as const;

export const HIGH_SENSITIVITY_FIELDS = [
  "bank_name",
  "bank_account_no",
  "bank_branch_code",
  "national_id",
  "passport_no",
  "kra_pin",
  "nssf_no",
  "shif_no",
] as const;

export const ALLOWED_FIELDS = [...NORMAL_FIELDS, ...HIGH_SENSITIVITY_FIELDS] as const;

export type AllowedField = (typeof ALLOWED_FIELDS)[number];

export function isHighSensitivityField(field: string): boolean {
  return (HIGH_SENSITIVITY_FIELDS as readonly string[]).includes(field);
}

// Human labels for the profile UI/forms — plain object instead of the
// `.replace(/_/g, " ")` the original action used, so labels read naturally
// ("KRA PIN", not "kra pin").
export const FIELD_LABELS: Record<AllowedField, string> = {
  personal_email: "Personal email",
  phone_number: "Phone number",
  physical_address: "Physical address",
  postal_address: "Postal address",
  marital_status: "Marital status",
  nationality: "Nationality",
  emergency_contact_name: "Emergency contact name",
  emergency_contact_phone: "Emergency contact phone",
  emergency_contact_relationship: "Emergency contact relationship",
  next_of_kin_name: "Next of kin name",
  next_of_kin_phone: "Next of kin phone",
  next_of_kin_relationship: "Next of kin relationship",
  bank_name: "Bank name",
  bank_account_no: "Bank account number",
  bank_branch_code: "Bank branch code",
  national_id: "National ID",
  passport_no: "Passport number",
  kra_pin: "KRA PIN",
  nssf_no: "NSSF number",
  shif_no: "SHIF number",
};

// Masks all but the last 4 characters — spec §5/§14 "masked view by
// default" for bank accounts, national IDs and other sensitive identifiers.
export function maskValue(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return "•".repeat(trimmed.length - 4) + trimmed.slice(-4);
}
