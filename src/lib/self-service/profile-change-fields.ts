// Plain constant, kept out of profile-change-actions.ts ("use server") since
// a Server Actions file may only export async functions — this needs to be
// importable from a client component (the field <select> options).
export const ALLOWED_FIELDS = [
  "personal_email",
  "phone_number",
  "physical_address",
  "postal_address",
  "marital_status",
  "nationality",
] as const;
