import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createRequisition, closeRequisition } from "./actions";

export default async function RecruitmentPage() {
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
  const isManager = appUser?.role === "manager";

  const [{ data: requisitions }, { data: employees }] = await Promise.all([
    supabase
      .from("requisitions")
      .select("id, role, department, headcount, status, raised_on, employees(name)")
      .order("raised_on", { ascending: false }),
    isHrLike
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Recruitment</h1>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Headcount</th>
              <th className="px-4 py-2 font-medium">Hiring Manager</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(requisitions ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/recruitment/${r.id}`} className="text-blue-600 hover:underline">
                    {r.role}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.department}</td>
                <td className="px-4 py-2">{r.headcount}</td>
                <td className="px-4 py-2">
                  {(r.employees as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2">
                  {r.status === "Open" && (isHrLike || isManager) && (
                    <form action={closeRequisition.bind(null, r.id)}>
                      <button className="text-xs text-neutral-500 underline">Close</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(!requisitions || requisitions.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  No requisitions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(isHrLike || isManager) && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Raise a requisition</h2>
          <form action={createRequisition} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <input name="role" placeholder="Role / Job title" required className="border border-neutral-300 rounded px-3 py-2" />
            <input name="department" placeholder="Department" required className="border border-neutral-300 rounded px-3 py-2" />
            <input name="headcount" type="number" min={1} defaultValue={1} className="border border-neutral-300 rounded px-3 py-2" />
            {isHrLike && (
              <select name="hiring_manager_id" className="border border-neutral-300 rounded px-3 py-2">
                <option value="">Hiring manager (optional)</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" className="sm:col-span-4 bg-neutral-900 text-white rounded py-2 font-medium">
              Raise requisition
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
