// Area 06 §8 "do not create manager-specific approval tables" — getMyTasks()
// (Area 05) is already role-generic, so /dashboard/me/tasks already shows a
// manager's assigned approval/workflow tasks correctly. Thin redirect
// instead of a second task list reading the same two tables.
import { redirect } from "next/navigation";

export default function ManagerTasksPage() {
  redirect("/dashboard/me/tasks");
}
