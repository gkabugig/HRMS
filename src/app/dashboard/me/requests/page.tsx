// Area 05 §10/§29 "do not rebuild existing HR modules" — the HR Service
// Centre page (src/app/dashboard/service-requests/page.tsx) already IS the
// employee's "My HR Requests" self-service surface: role-branched, already
// RLS-scoped to self for the employee role, with a working create form,
// status list, and SLA display. Rebuilding it at this path would be the
// exact duplication the spec warns against, so this route is the same alias
// relationship /dashboard/employees/me already has with Employee 360.
import { redirect } from "next/navigation";

export default function MyRequestsRedirect() {
  redirect("/dashboard/service-requests");
}
