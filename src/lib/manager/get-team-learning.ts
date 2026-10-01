// Area 06 §12 "Learning Workspace" — mandatory-course completion across the
// team and a per-employee overdue list. training_enrollments has an
// existing "enrollments_manager_team_read" RLS policy (0002) and
// training_courses is org-readable ("courses_read_all"), so no new RLS was
// needed for this workspace.
import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamLearningData = {
  mandatoryCompletion: { completed: number; total: number };
  overdueByEmployee: { employeeId: string; employeeName: string; courseName: string }[];
  recentCompletions: { employeeId: string; employeeName: string; courseName: string; completedOn: string }[];
};

export async function getTeamLearning(supabase: SupabaseClient, employeeIds: string[]): Promise<TeamLearningData> {
  if (employeeIds.length === 0) return { mandatoryCompletion: { completed: 0, total: 0 }, overdueByEmployee: [], recentCompletions: [] };

  const [{ data: employees }, { data: mandatoryCourses }, { data: enrollments }] = await Promise.all([
    supabase.from("employees").select("id, name").in("id", employeeIds).eq("status", "Active"),
    supabase.from("training_courses").select("id, name").eq("mandatory", true),
    supabase
      .from("training_enrollments")
      .select("employee_id, status, completed_on, course_id, training_courses(name)")
      .in("employee_id", employeeIds)
      .order("completed_on", { ascending: false }),
  ]);

  const activeEmployees = employees ?? [];
  const mandatory = (mandatoryCourses ?? []) as { id: string; name: string }[];
  const enrollmentRows = (enrollments ?? []) as unknown as {
    employee_id: string;
    status: string;
    completed_on: string | null;
    course_id: string;
    training_courses: { name: string } | null;
  }[];

  const completedCourseIdsByEmployee = new Map<string, Set<string>>();
  for (const e of enrollmentRows) {
    if (e.status !== "Completed") continue;
    if (!completedCourseIdsByEmployee.has(e.employee_id)) completedCourseIdsByEmployee.set(e.employee_id, new Set());
    completedCourseIdsByEmployee.get(e.employee_id)!.add(e.course_id);
  }

  let completed = 0;
  let total = 0;
  const overdueByEmployee: TeamLearningData["overdueByEmployee"] = [];
  for (const emp of activeEmployees) {
    const done = completedCourseIdsByEmployee.get(emp.id) ?? new Set<string>();
    for (const course of mandatory) {
      total++;
      if (done.has(course.id)) {
        completed++;
      } else {
        overdueByEmployee.push({ employeeId: emp.id, employeeName: emp.name, courseName: course.name });
      }
    }
  }

  const employeeNameById = new Map(activeEmployees.map((e) => [e.id, e.name]));
  const recentCompletions = enrollmentRows
    .filter((e) => e.status === "Completed" && e.completed_on)
    .slice(0, 10)
    .map((e) => ({
      employeeId: e.employee_id,
      employeeName: employeeNameById.get(e.employee_id) ?? "—",
      courseName: e.training_courses?.name ?? "—",
      completedOn: e.completed_on as string,
    }));

  return { mandatoryCompletion: { completed, total }, overdueByEmployee, recentCompletions };
}
