import ActionForm from "@/components/forms/action-form";
import { createClient } from "@/lib/supabase/server";
import {
  createCourse,
  enrollSelf,
  enrollEmployee,
  markEnrollmentComplete,
} from "./actions";
import DeleteCourseButton from "./components/delete-course-button";
import EditCourseModal from "./components/edit-course-modal";

export default async function LearningDevelopmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";
  const isManagerLike = isHrLike || appUser?.role === "manager";

  const [{ data: courses }, enrollmentsRes, employeesRes] = await Promise.all([
    supabase
      .from("training_courses")
      .select("id, name, provider, mode, duration, cost, mandatory, validity_months")
      .order("name"),
    supabase
      .from("training_enrollments")
      .select(
        "id, status, enrolled_on, completed_on, certificate_note, employees(name), training_courses(name)"
      )
      .order("enrolled_on", { ascending: false }),
    isHrLike
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  // RLS already scopes `enrollments` to the right rows per role (own for
  // employee, team for manager, all for HR/admin), so no client-side
  // filtering is needed on top of it.
  const enrollments = enrollmentsRes.data ?? [];
  const employees = employeesRes.data;

  // Separate lookup of the signed-in user's own enrollments, so the
  // "Enroll" button in the catalog knows which courses to hide (used even
  // for HR/manager users who may also be enrolled in courses themselves).
  const { data: myEnrollments } = appUser?.employee_id
    ? await supabase
        .from("training_enrollments")
        .select("course_id")
        .eq("employee_id", appUser.employee_id)
    : { data: [] as { course_id: string }[] | null };
  const myEnrolledCourseIds = new Set((myEnrollments ?? []).map((e) => e.course_id));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Learning &amp; Development</h1>

      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Course catalog</h2>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Mode</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Mandatory</th>
                <th className="px-4 py-2 font-medium"></th>
                {isHrLike && <th className="px-4 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {(courses ?? []).map((c) => (
                <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.provider ?? "—"}</td>
                  <td className="px-4 py-2">{c.mode ?? "—"}</td>
                  <td className="px-4 py-2">{c.duration ?? "—"}</td>
                  <td className="px-4 py-2">
                    {c.mandatory && (
                      <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                        Mandatory
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {appUser?.employee_id && !myEnrolledCourseIds.has(c.id) && (
                      <ActionForm action={enrollSelf.bind(null, c.id)} successMessage={null}>
                        <button type="submit" className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1">
                          Enroll
                        </button>
                      </ActionForm>
                    )}
                    {myEnrolledCourseIds.has(c.id) && (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">Enrolled</span>
                    )}
                  </td>
                  {isHrLike && (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-3">
                        <EditCourseModal course={c} />
                        <DeleteCourseButton courseId={c.id} courseName={c.name} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(!courses || courses.length === 0) && (
                <tr>
                  <td colSpan={isHrLike ? 7 : 6} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                    No courses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isHrLike && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Add a course</h2>
          <ActionForm action={createCourse} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input name="name" placeholder="Course name" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="provider" placeholder="Provider" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <select name="mode" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Mode</option>
              <option>In-person</option>
              <option>Online</option>
              <option>Blended</option>
            </select>
            <input name="duration" placeholder="Duration (e.g. 2 days)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="cost" type="number" step="0.01" placeholder="Cost (KES)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="validity_months" type="number" placeholder="Validity (months, optional)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" name="mandatory" /> Mandatory course
            </label>
            <button type="submit" className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Add course
            </button>
          </ActionForm>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">
          {isHrLike ? "All enrollments" : isManagerLike ? "Team enrollments" : "My enrollments"}
        </h2>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                {isManagerLike && <th className="px-4 py-2 font-medium">Employee</th>}
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Enrolled</th>
                <th className="px-4 py-2 font-medium">Completed</th>
                {isHrLike && <th className="px-4 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  {isManagerLike && (
                    <td className="px-4 py-2">
                      {(e.employees as unknown as { name: string } | null)?.name ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-2">
                    {(e.training_courses as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        e.status === "Completed"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{e.enrolled_on}</td>
                  <td className="px-4 py-2">{e.completed_on ?? "—"}</td>
                  {isHrLike && (
                    <td className="px-4 py-2 text-right">
                      {e.status !== "Completed" && (
                        <details>
                          <summary className="text-xs text-blue-600 cursor-pointer">Mark complete</summary>
                          <ActionForm
                            action={markEnrollmentComplete.bind(null, e.id)}
                            className="mt-2 flex flex-col gap-2 items-end"
                          >
                            <input
                              name="completed_on"
                              type="date"
                              defaultValue={new Date().toISOString().slice(0, 10)}
                              className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 text-xs"
                            />
                            <input
                              name="certificate_note"
                              placeholder="Certificate note"
                              className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 text-xs"
                            />
                            <button type="submit" className="text-xs bg-green-700 text-white rounded px-3 py-1">
                              Save
                            </button>
                          </ActionForm>
                        </details>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {enrollments.length === 0 && (
                <tr>
                  <td colSpan={isManagerLike ? (isHrLike ? 6 : 5) : 4} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                    No enrollments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isHrLike && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Enroll an employee</h2>
          <ActionForm action={enrollEmployee} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <select name="employee_id" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Select employee</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <select name="course_id" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Select course</option>
              {(courses ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Enroll
            </button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
