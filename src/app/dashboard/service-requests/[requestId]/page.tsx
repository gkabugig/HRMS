import { createClient } from "@/lib/supabase/server";
import { updateServiceRequestStatus, addServiceMessage } from "@/lib/service-requests/actions";

const STATUSES = ["Submitted", "Triaged", "Assigned", "In Progress", "Waiting for Employee", "Resolved", "Closed"];

export default async function ServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";

  const [{ data: request }, { data: messages }, { data: history }] = await Promise.all([
    supabase
      .from("service_requests")
      .select("id, subject, description, priority, status, sla_due_at, created_at, employees(name, staff_no)")
      .eq("id", requestId)
      .single(),
    supabase
      .from("service_request_messages")
      .select("id, message, internal_only, created_at, author_user_id")
      .eq("service_request_id", requestId)
      .order("created_at"),
    supabase
      .from("service_request_status_history")
      .select("from_status, to_status, created_at")
      .eq("service_request_id", requestId)
      .order("created_at"),
  ]);

  if (!request) {
    return <p className="text-sm text-neutral-400">Request not found, or you don&apos;t have permission to view it.</p>;
  }

  const emp = request.employees as unknown as { name: string; staff_no: string } | null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">{request.subject}</h1>
        <p className="text-sm text-neutral-500">
          {emp ? `${emp.name} (${emp.staff_no})` : ""} · Raised {new Date(request.created_at).toLocaleString("en-KE")}
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <p className="text-sm text-neutral-800 whitespace-pre-wrap">{request.description}</p>
      </div>

      {isHrLike && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-2">Status</h2>
          <form action={async (formData: FormData) => {
            "use server";
            await updateServiceRequestStatus(requestId, String(formData.get("status")));
          }} className="flex gap-2 items-center">
            <select name="status" defaultValue={request.status} className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white text-sm">
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 text-sm font-medium">
              Update
            </button>
          </form>
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Conversation</h2>
        <ul className="space-y-3 mb-4">
          {(messages ?? []).map((m) => (
            <li key={m.id} className={`text-sm p-2.5 rounded-lg ${m.internal_only ? "bg-amber-50 border border-amber-200" : "bg-neutral-50"}`}>
              <p className="whitespace-pre-wrap">{m.message}</p>
              <p className="text-[10px] text-neutral-400 mt-1">
                {new Date(m.created_at).toLocaleString("en-KE")}
                {m.internal_only && " · internal note"}
              </p>
            </li>
          ))}
          {(!messages || messages.length === 0) && <p className="text-sm text-neutral-400">No messages yet.</p>}
        </ul>
        <form action={addServiceMessage.bind(null, requestId)} className="space-y-2">
          <textarea name="message" required rows={3} placeholder="Write a reply…" className="w-full border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm" />
          <div className="flex items-center justify-between">
            {isHrLike && (
              <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                <input type="checkbox" name="internal_only" /> Internal note (not visible to employee)
              </label>
            )}
            <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 text-sm font-medium">
              Send
            </button>
          </div>
        </form>
      </div>

      {isHrLike && history && history.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-2">Status history</h2>
          <ul className="text-xs text-neutral-500 space-y-1">
            {history.map((h, i) => (
              <li key={i}>
                {new Date(h.created_at).toLocaleString("en-KE")} — {h.from_status ?? "—"} → {h.to_status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
