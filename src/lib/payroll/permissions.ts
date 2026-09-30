// Payroll Command Centre role access (spec §21). RLS on payroll_runs,
// payslips and the new payroll_* tables is the real boundary (admin/hr
// full access, employee self-only via payslips_self_read, no manager
// policy at all — deliberate, matches the app's existing payroll RLS
// stance). This just decides what the page renders on top of that.
import type { UserRole } from "@/lib/auth/roles";

export function canManagePayroll(role: UserRole): boolean {
  return role === "admin" || role === "hr";
}

export function canSeeIndividualSalary(role: UserRole): boolean {
  // Spec §21: "Manager — No individual salary by default." This app has no
  // manager RLS policy on payslips/payroll_runs at all, so a manager
  // viewing the command centre would see nothing regardless; this flag
  // only decides page composition (whether to render the register/salary
  // figures at all vs. an access-restricted message).
  return role === "admin" || role === "hr";
}
