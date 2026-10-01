// Area 06 §8 "do not create manager-specific approval tables" / spec
// architectural principle "Area 02 is the only approval engine". The
// Approvals Centre at /dashboard/approvals is already role-generic (keys
// off the signed-in user, not a role branch), so this is a thin redirect,
// not a second approvals UI.
import { redirect } from "next/navigation";

export default function ManagerApprovalsPage() {
  redirect("/dashboard/approvals");
}
