// Area 06 §13 "Recruitment Workspace" — spec §8 "do not create a parallel
// HR platform". The existing /dashboard/recruitment page is already
// role-generic: it lets a manager raise a requisition (hiring_manager_id
// defaults to the manager's own employee_id — see actions.ts) and add
// candidates to their own pipeline, and "requisitions_manager_own" /
// "candidates_manager_read" RLS already scope what a manager sees there to
// exactly their own requisitions. A thin redirect avoids duplicating that
// engine rather than rebuilding a second, read-only recruitment view.
import { redirect } from "next/navigation";

export default function ManagerRecruitmentPage() {
  redirect("/dashboard/recruitment");
}
