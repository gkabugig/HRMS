import { createClient } from "@/lib/supabase/server";
import { createEmployee, updateEmployeeCompliance } from "./actions";

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// Section 37: a casual worker who has been engaged for an aggregate month
// gains a right to written terms; ~3 months' continuous engagement converts
// several term-employee protections (redundancy, notice/termination process).
function casualConversionFlag(dateOfHire: string): string | null {
  const daysEngaged = daysBetween(new Date(dateOfHire), new Date());
  if (daysEngaged >= 90) return "Casual 90+ days — term-employee protections likely apply";
  if (daysEngaged >= 30) return "Casual 30+ days — written terms now due";
  return null;
}

export default async function EmployeesPage() {
  const supabase = await createClient();

  const [{ data: employees }, { data: appUser }] = await Promise.all([
    supabase.from("employees").select("*").order("name"),
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return supabase.from("app_users").select("role").eq("id", user!.id).maybeSingle();
    })(),
  ]);

  const canEdit = appUser?.role === "admin" || appUser?.role === "hr";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Employees</h1>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Staff No</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Job Title</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Compliance</th>
              {canEdit && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {(employees ?? []).map((e) => {
              const today = new Date().toISOString().slice(0, 10);
              const onProbation = e.probation_end_date && e.probation_end_date >= today;
              const casualFlag =
                e.employment_type === "Casual" ? casualConversionFlag(e.date_of_hire) : null;
              return (
                <tr key={e.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-2">{e.staff_no}</td>
                  <td className="px-4 py-2">{e.name}</td>
                  <td className="px-4 py-2">{e.department}</td>
                  <td className="px-4 py-2">{e.job_title}</td>
                  <td className="px-4 py-2">{e.employment_type}</td>
                  <td className="px-4 py-2">{e.status}</td>
                  <td className="px-4 py-2 space-y-1">
                    {onProbation && (
                      <div>
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                          On probation until {e.probation_end_date}
                        </span>
                      </div>
                    )}
                    {!e.contract_issued_on && (
                      <div>
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          No written contract on file
                        </span>
                      </div>
                    )}
                    {casualFlag && (
                      <div>
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                          {casualFlag}
                        </span>
                      </div>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2">
                      <details>
                        <summary className="text-xs text-blue-600 cursor-pointer">Edit</summary>
                        <form
                          action={updateEmployeeCompliance.bind(null, e.id)}
                          className="mt-2 flex flex-col gap-2 text-xs w-48"
                        >
                          <label className="text-neutral-500">
                            Probation ends
                            <input
                              name="probation_end_date"
                              type="date"
                              defaultValue={e.probation_end_date ?? ""}
                              className="w-full border border-neutral-300 rounded px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Contract issued on
                            <input
                              name="contract_issued_on"
                              type="date"
                              defaultValue={e.contract_issued_on ?? ""}
                              className="w-full border border-neutral-300 rounded px-2 py-1 mt-0.5"
                            />
                          </label>
                          <button type="submit" className="bg-neutral-200 rounded px-3 py-1">
                            Save
                          </button>
                        </form>
                      </details>
                    </td>
                  )}
                </tr>
              );
            })}
            {(!employees || employees.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Add employee</h2>
          <form action={createEmployee} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input name="staff_no" placeholder="Staff No" required className="border border-neutral-300 rounded px-3 py-2" />
            <input name="name" placeholder="Full name" required className="border border-neutral-300 rounded px-3 py-2" />
            <input name="department" placeholder="Department" required className="border border-neutral-300 rounded px-3 py-2" />
            <input name="job_title" placeholder="Job title" required className="border border-neutral-300 rounded px-3 py-2" />
            <select name="employment_type" className="border border-neutral-300 rounded px-3 py-2">
              <option>Permanent</option>
              <option>Contract</option>
              <option>Casual</option>
              <option>Intern</option>
            </select>
            <input name="date_of_hire" type="date" required className="border border-neutral-300 rounded px-3 py-2" />
            <label className="text-xs text-neutral-500 flex flex-col gap-1">
              Probation ends (defaults to hire date + 6 months)
              <input name="probation_end_date" type="date" className="border border-neutral-300 rounded px-3 py-2" />
            </label>
            <label className="text-xs text-neutral-500 flex flex-col gap-1">
              Written contract issued on
              <input name="contract_issued_on" type="date" className="border border-neutral-300 rounded px-3 py-2" />
            </label>
            <input name="basic" type="number" step="0.01" placeholder="Basic salary" className="border border-neutral-300 rounded px-3 py-2" />
            <input name="house_allowance" type="number" step="0.01" placeholder="House allowance" className="border border-neutral-300 rounded px-3 py-2" />
            <input name="transport_allowance" type="number" step="0.01" placeholder="Transport allowance" className="border border-neutral-300 rounded px-3 py-2" />
            <input name="other_allowance" type="number" step="0.01" placeholder="Other allowance" className="border border-neutral-300 rounded px-3 py-2" />
            <input name="kra_pin" placeholder="KRA PIN" className="border border-neutral-300 rounded px-3 py-2" />
            <input name="nssf_no" placeholder="NSSF No" className="border border-neutral-300 rounded px-3 py-2" />
            <input name="shif_no" placeholder="SHIF No" className="border border-neutral-300 rounded px-3 py-2" />
            <button type="submit" className="sm:col-span-3 bg-neutral-900 text-white rounded py-2 font-medium">
              Add employee
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
