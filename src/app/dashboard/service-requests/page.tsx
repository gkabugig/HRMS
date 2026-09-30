import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { submitServiceRequest } from "@/lib/service-requests/actions";

const STATUS_STYLE: Record<string, string> = {
  Submitted: "bg-neutral-100 text-neutral-600",
  Triaged: "bg-blue-100 text-blue-700",
  Assigned: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  "Waiting for Employee": "bg-amber-100 text-amber-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-neutral-100 text-neutral-400",
};

export default async function ServiceRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();
  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";

  const [{ data: requests }, { data: catalogue }] = await Promise.all([
    supabase
      .from("service_requests")
      .select("id, subject, priority, status, sla_due_at, created_at, employees(name, staff_no)")
      .order("created_at", { ascending: false }),
    supabase.from("service_catalogue").select("id, category, label").eq("active", true).order("category"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">{isHrLike ? "HR Service Centre" : "My HR Requests"}</h1>
        <p className="text-sm text-neutral-500">
          {isHrLike
            ? "Every request raised by an employee, most recent first."
            : "Raise a request with HR and track its status here."}
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Raise a request</h2>
        <form action={submitServiceRequest} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <select name="catalogue_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white sm:col-span-2">
            <option value="">General enquiry</option>
            {(catalogue ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.category} — {c.label}</option>
            ))}
          </select>
          <input name="subject" placeholder="Subject" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 sm:col-span-2" />
          <textarea name="description" placeholder="Details" required rows={3} className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 sm:col-span-2" />
          <select name="priority" defaultValue="normal" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium justify-self-start">
            Submit
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {isHrLike && <th className="px-4 py-2 font-medium">Employee</th>}
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Priority</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Raised</th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => {
              const emp = r.employees as unknown as { name: string; staff_no: string } | null;
              return (
                <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  {isHrLike && <td className="px-4 py-2">{emp ? `${emp.name} (${emp.staff_no})` : "—"}</td>}
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/service-requests/${r.id}`} className="text-brand-600 hover:underline font-medium">
                      {r.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 capitalize">{r.priority}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "bg-neutral-100"}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("en-KE")}</td>
                </tr>
              );
            })}
            {(!requests || requests.length === 0) && (
              <tr>
                <td colSpan={isHrLike ? 5 : 4} className="px-4 py-6 text-center text-neutral-400">
                  No requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
