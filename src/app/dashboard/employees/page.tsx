import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createEmployee, updateEmployee } from "./actions";

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

  const [{ data: employees }, { data: appUser }, { data: branches }] = await Promise.all([
    supabase.from("employees").select("*, branches(name)").order("name"),
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return supabase.from("app_users").select("role").eq("id", user!.id).maybeSingle();
    })(),
    supabase.from("branches").select("id, name").order("name"),
  ]);

  const canEdit = appUser?.role === "admin" || appUser?.role === "hr";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Employees</h1>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Staff No</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Job Title</th>
              <th className="px-4 py-2 font-medium">Branch</th>
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
              const branchName = (e.branches as unknown as { name: string } | null)?.name;
              const pendingStaffNo = e.staff_no?.startsWith("PENDING-");
              return (
                <tr key={e.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-2">{e.staff_no}</td>
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/employees/${e.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{e.department}</td>
                  <td className="px-4 py-2">{e.job_title}</td>
                  <td className="px-4 py-2">{branchName ?? "—"}</td>
                  <td className="px-4 py-2">{e.employment_type}</td>
                  <td className="px-4 py-2">{e.status}</td>
                  <td className="px-4 py-2 space-y-1">
                    {pendingStaffNo && (
                      <div>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Just hired — finish this record (staff no, pay, statutory numbers)
                        </span>
                      </div>
                    )}
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
                        <summary className="text-xs text-brand-600 hover:text-brand-700 cursor-pointer">Edit</summary>
                        <form
                          action={updateEmployee.bind(null, e.id)}
                          className="mt-2 flex flex-col gap-2 text-xs w-56"
                        >
                          <label className="text-neutral-500">
                            Staff No
                            <input
                              name="staff_no"
                              defaultValue={e.staff_no}
                              required
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Department
                            <input
                              name="department"
                              defaultValue={e.department}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Job title
                            <input
                              name="job_title"
                              defaultValue={e.job_title}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Employment type
                            <select
                              name="employment_type"
                              defaultValue={e.employment_type}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            >
                              <option>Permanent</option>
                              <option>Contract</option>
                              <option>Casual</option>
                              <option>Intern</option>
                            </select>
                          </label>
                          <label className="text-neutral-500">
                            Reports to
                            <select
                              name="reporting_manager_id"
                              defaultValue={e.reporting_manager_id ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            >
                              <option value="">— none —</option>
                              {(employees ?? [])
                                .filter((m) => m.id !== e.id)
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="text-neutral-500">
                            Branch
                            <select
                              name="branch_id"
                              defaultValue={e.branch_id ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            >
                              <option value="">— none —</option>
                              {(branches ?? []).map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-neutral-500">
                            Probation ends
                            <input
                              name="probation_end_date"
                              type="date"
                              defaultValue={e.probation_end_date ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Contract issued on
                            <input
                              name="contract_issued_on"
                              type="date"
                              defaultValue={e.contract_issued_on ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Date of hire
                            <input
                              name="date_of_hire"
                              type="date"
                              defaultValue={e.date_of_hire ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <p className="text-neutral-400 pt-1 border-t border-neutral-100">Compensation</p>
                          <label className="text-neutral-500">
                            Basic salary
                            <input
                              name="basic"
                              type="number"
                              step="0.01"
                              defaultValue={e.basic ?? 0}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            House allowance
                            <input
                              name="house_allowance"
                              type="number"
                              step="0.01"
                              defaultValue={e.house_allowance ?? 0}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Transport allowance
                            <input
                              name="transport_allowance"
                              type="number"
                              step="0.01"
                              defaultValue={e.transport_allowance ?? 0}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Other allowance
                            <input
                              name="other_allowance"
                              type="number"
                              step="0.01"
                              defaultValue={e.other_allowance ?? 0}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <p className="text-neutral-400 pt-1 border-t border-neutral-100">Statutory</p>
                          <label className="text-neutral-500">
                            KRA PIN
                            <input
                              name="kra_pin"
                              defaultValue={e.kra_pin ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            NSSF No
                            <input
                              name="nssf_no"
                              defaultValue={e.nssf_no ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            SHIF No
                            <input
                              name="shif_no"
                              defaultValue={e.shif_no ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <p className="text-neutral-400 pt-1 border-t border-neutral-100">Bank details (payroll)</p>
                          <label className="text-neutral-500">
                            Bank name
                            <input
                              name="bank_name"
                              defaultValue={e.bank_name ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Account no
                            <input
                              name="bank_account_no"
                              defaultValue={e.bank_account_no ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <label className="text-neutral-500">
                            Branch code
                            <input
                              name="bank_branch_code"
                              defaultValue={e.bank_branch_code ?? ""}
                              className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 mt-0.5"
                            />
                          </label>
                          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
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
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Add employee</h2>
          <form action={createEmployee} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input name="staff_no" placeholder="Staff No" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="name" placeholder="Full name" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="department" placeholder="Department" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="job_title" placeholder="Job title" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <select name="employment_type" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option>Permanent</option>
              <option>Contract</option>
              <option>Casual</option>
              <option>Intern</option>
            </select>
            <input name="date_of_hire" type="date" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <select name="reporting_manager_id" defaultValue="" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Reports to (optional)</option>
              {(employees ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select name="branch_id" defaultValue="" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Branch (optional)</option>
              {(branches ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <label className="text-xs text-neutral-500 flex flex-col gap-1">
              Probation ends (defaults to hire date + 6 months)
              <input name="probation_end_date" type="date" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            </label>
            <label className="text-xs text-neutral-500 flex flex-col gap-1">
              Written contract issued on
              <input name="contract_issued_on" type="date" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            </label>
            <input name="basic" type="number" step="0.01" placeholder="Basic salary" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="house_allowance" type="number" step="0.01" placeholder="House allowance" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="transport_allowance" type="number" step="0.01" placeholder="Transport allowance" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="other_allowance" type="number" step="0.01" placeholder="Other allowance" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="kra_pin" placeholder="KRA PIN" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="nssf_no" placeholder="NSSF No" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="shif_no" placeholder="SHIF No" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <button type="submit" className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Add employee
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
