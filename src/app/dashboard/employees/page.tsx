import { createClient } from "@/lib/supabase/server";
import { createEmployee } from "./actions";

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
            </tr>
          </thead>
          <tbody>
            {(employees ?? []).map((e) => (
              <tr key={e.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{e.staff_no}</td>
                <td className="px-4 py-2">{e.name}</td>
                <td className="px-4 py-2">{e.department}</td>
                <td className="px-4 py-2">{e.job_title}</td>
                <td className="px-4 py-2">{e.employment_type}</td>
                <td className="px-4 py-2">{e.status}</td>
              </tr>
            ))}
            {(!employees || employees.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
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
