import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ActionForm from "@/components/forms/action-form";
import { assignGrades } from "@/lib/compensation/grade-actions";

const SEL = "border border-[var(--border-subtle)] bg-[var(--surface)] rounded-lg px-2 py-1.5 text-xs w-full";

export default async function AssignGradesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();
  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }
  const orgId = appUser.org_id as string;
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: emps }, { data: grades }, { data: bands }, { data: hist }] = await Promise.all([
    supabase.from("employees").select("id, name, staff_no, department, job_title, basic").eq("org_id", orgId).eq("status", "Active").order("name"),
    supabase.from("compensation_grades").select("id, code, name").eq("org_id", orgId).order("order_rank"),
    supabase.from("compensation_bands").select("grade_id, min_amount, max_amount, effective_from, effective_to").eq("org_id", orgId).lte("effective_from", today),
    supabase.from("employee_compensation_history").select("employee_id, grade_id").is("effective_to", null),
  ]);
  const gradeOf = new Map((hist ?? []).map((h) => [h.employee_id as string, (h.grade_id as string | null) ?? ""]));
  const band = new Map<string, { min: number; max: number }>();
  for (const b of bands ?? []) if (!b.effective_to || (b.effective_to as string) >= today) band.set(b.grade_id as string, { min: Number(b.min_amount), max: Number(b.max_amount) });
  const unassigned = (emps ?? []).filter((e) => !gradeOf.get(e.id as string)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Assign grades</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Put employees on a grade in one go. This does not change anyone&apos;s pay; it records which grade they are on, and each change is logged. To change pay or promote, use{" "}
          <Link href="/dashboard/compensation/change-requests" className="text-brand-600 underline">Change Requests</Link>. {unassigned} of {(emps ?? []).length} active employees have no grade yet.
        </p>
      </div>
      {(grades ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">Create grades first under <Link href="/dashboard/compensation/grades" className="text-brand-600 underline">Grades &amp; Bands</Link>.</p>
      ) : (
        <ActionForm action={assignGrades} successMessage="Grades saved." resetOnSuccess={false} className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500"><th className="p-3 font-medium">Employee</th><th className="font-medium">Role</th><th className="font-medium text-right">Basic (KES)</th><th className="font-medium p-3 w-64">Grade</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {(emps ?? []).map((e) => {
                  const current = gradeOf.get(e.id as string) ?? "";
                  const b = current ? band.get(current) : undefined;
                  const outside = b && (Number(e.basic) < b.min || Number(e.basic) > b.max);
                  return (
                    <tr key={e.id as string}>
                      <td className="p-3 text-neutral-900 dark:text-neutral-50">{e.name as string} <span className="text-neutral-400">· {e.staff_no as string}</span></td>
                      <td className="text-neutral-600 dark:text-neutral-300">{(e.job_title as string) ?? "—"}<span className="text-neutral-400"> · {(e.department as string) ?? "—"}</span></td>
                      <td className="text-right tabular-nums">{Math.round(Number(e.basic)).toLocaleString("en-KE")}{outside && <span className="block text-[10px] text-amber-600">outside current band</span>}</td>
                      <td className="p-3">
                        <input type="hidden" name={`orig_${e.id}`} value={current} />
                        <select name={`grade_${e.id}`} defaultValue={current} className={SEL}>
                          <option value="">No grade</option>
                          {(grades ?? []).map((g) => <option key={g.id as string} value={g.id as string}>{g.code as string} — {g.name as string}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="text-xs font-medium rounded-lg px-3 py-1.5 bg-brand-600 text-white hover:bg-brand-700">Save grades</button>
        </ActionForm>
      )}
    </div>
  );
}
