import type { UserRole } from "@/lib/auth/roles";

export function isCommandCentreRole(role: UserRole): boolean {
  return role === "admin" || role === "hr" || role === "manager";
}

export function canCorrectAttendance(role: UserRole): boolean {
  return role === "admin" || role === "hr" || role === "manager";
}
