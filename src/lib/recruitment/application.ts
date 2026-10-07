const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Checks what a public applicant typed. Returns a friendly message or null.
export function validateApplication(input: { name: string; email: string; phone: string; consent: boolean }): string | null {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) return "Please enter your full name.";
  if (!EMAIL.test(input.email.trim()) || input.email.length > 200) return "Please enter a valid email address.";
  const digits = input.phone.replace(/[^\d]/g, "");
  if (digits.length < 9 || digits.length > 15) return "Please enter a valid phone number.";
  if (!input.consent) return "Please tick the box to let us keep your details for this application.";
  return null;
}

// A job is open to the public only while approved, open, published and not past its closing date.
export function isAcceptingApplications(r: {
  status: string;
  approval_status: string;
  published: boolean;
  closing_date: string | null;
}, today: string): boolean {
  if (!r.published || r.status !== "Open" || r.approval_status !== "Approved") return false;
  return !r.closing_date || r.closing_date >= today;
}

// Today's date in Kenya (UTC+3) as YYYY-MM-DD.
export function kenyaToday(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}
