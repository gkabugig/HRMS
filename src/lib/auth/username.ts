// Username sign-in support. Supabase Auth identifies accounts by email, so a
// username account is stored as a synthetic internal email
// "<username>@hrms.local" (never delivered to - see isInternalUsernameEmail,
// which the notification layer uses to skip email for these accounts). The
// mapping is deterministic, so signing in needs no lookup table: the login
// form just converts what the person typed into the matching email.
//
// Pure functions only - this module is imported by the client-side login
// page, so it must not touch server-only code.
export const USERNAME_EMAIL_DOMAIN = "hrms.local";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(u)) {
    return "Username must be 3-30 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number.";
  }
  return null;
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_EMAIL_DOMAIN}`;
}

export function isInternalUsernameEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

// What the person typed into a "Username or email" box. Anything containing
// "@" is treated as a real email; anything else as a username.
export function resolveLoginIdentifier(raw: string): { email: string; username: string | null } {
  const value = raw.trim();
  if (value.includes("@")) return { email: value.toLowerCase(), username: null };
  const username = normalizeUsername(value);
  return { email: usernameToEmail(username), username };
}
