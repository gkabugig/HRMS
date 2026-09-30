import { createClient } from "@/lib/supabase/server";
import { recordHearing, addAttachment, deleteAttachment } from "./actions";

const ACTION_TYPES = ["Verbal warning", "Written warning", "Suspension", "Termination", "No action"];

export default async function DisciplinaryPage() {
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
  const canRecord = isHrLike || appUser?.role === "manager";

  const [{ data: records }, { data: employees }] = await Promise.all([
    supabase
      .from("disciplinary_actions")
      .select(
        "id, employee_id, reason, hearing_date, representative_present, representative_name, employee_response, outcome, action_type, employees(name)"
      )
      .order("hearing_date", { ascending: false }),
    canRecord
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  const recordIds = (records ?? []).map((r) => r.id);
  const { data: attachmentRows } =
    recordIds.length > 0
      ? await supabase
          .from("disciplinary_attachments")
          .select("id, disciplinary_action_id, file_path, file_name, uploaded_at")
          .in("disciplinary_action_id", recordIds)
          .order("uploaded_at", { ascending: false })
      : { data: [] as { id: string; disciplinary_action_id: string; file_path: string; file_name: string; uploaded_at: string }[] };

  const attachmentsByRecord = new Map<string, { id: string; file_path: string; file_name: string; url: string | null }[]>();
  for (const a of attachmentRows ?? []) {
    const { data: signed } = await supabase.storage
      .from("disciplinary-documents")
      .createSignedUrl(a.file_path, 3600);
    const list = attachmentsByRecord.get(a.disciplinary_action_id) ?? [];
    list.push({ id: a.id, file_path: a.file_path, file_name: a.file_name, url: signed?.signedUrl ?? null });
    attachmentsByRecord.set(a.disciplinary_action_id, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">
          {isHrLike ? "Disciplinary Records" : appUser?.role === "manager" ? "Team Disciplinary Records" : "My Disciplinary Records"}
        </h1>
        <p className="text-sm text-neutral-500">
          Employment Act s.41: before dismissing for misconduct, poor performance, or incapacity, the
          employee must be told the reason and heard, with a representative present if they choose.
          This is that record.
        </p>
      </div>

      <div className="space-y-4">
        {(records ?? []).map((r) => (
          <div key={r.id} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">
                  {(r.employees as unknown as { name: string } | null)?.name ?? "—"}
                </span>
                <span className="text-xs text-neutral-500 ml-2">{r.hearing_date}</span>
              </div>
              <span className="text-xs uppercase tracking-wide bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
                {r.action_type}
              </span>
            </div>
            <p className="text-sm text-neutral-700 mt-2">{r.reason}</p>
            <p className="text-xs text-neutral-500 mt-1">
              Representative present: {r.representative_present ? r.representative_name || "Yes" : "No"}
            </p>
            {r.employee_response && (
              <p className="text-xs text-neutral-600 mt-1">Employee response: {r.employee_response}</p>
            )}
            {r.outcome && <p className="text-xs text-neutral-600 mt-1">Outcome: {r.outcome}</p>}

            <div className="mt-3 border-t border-neutral-100 pt-3">
              <p className="text-xs font-medium text-neutral-600 mb-2">Attached documents</p>
              <ul className="space-y-1">
                {(attachmentsByRecord.get(r.id) ?? []).map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 hover:underline">
                        {a.file_name}
                      </a>
                    ) : (
                      <span className="text-neutral-400">{a.file_name} (link unavailable)</span>
                    )}
                    {isHrLike && (
                      <form action={deleteAttachment.bind(null, a.id, a.file_path)}>
                        <button type="submit" className="text-xs text-red-600 hover:underline">
                          Remove
                        </button>
                      </form>
                    )}
                  </li>
                ))}
                {(attachmentsByRecord.get(r.id) ?? []).length === 0 && (
                  <li className="text-xs text-neutral-400">No documents attached.</li>
                )}
              </ul>
              {canRecord && (
                <form
                  action={addAttachment.bind(null, r.id, r.employee_id)}
                  className="mt-2 flex gap-2 text-sm items-center"
                >
                  <input
                    name="file"
                    type="file"
                    required
                    className="flex-1 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1"
                  />
                  <button type="submit" className="text-xs bg-neutral-200 rounded px-3 py-1">
                    Attach
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
        {(!records || records.length === 0) && (
          <p className="text-sm text-neutral-400">No disciplinary records yet.</p>
        )}
      </div>

      {canRecord && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Record a hearing</h2>
          <form action={recordHearing} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <select name="employee_id" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Select employee</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <input
              name="hearing_date"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <textarea
              name="reason"
              placeholder="Reason explained to the employee"
              required
              rows={2}
              className="sm:col-span-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="representative_present" /> Representative present
            </label>
            <input
              name="representative_name"
              placeholder="Representative name (if any)"
              className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <textarea
              name="employee_response"
              placeholder="Employee's response / representations"
              rows={2}
              className="sm:col-span-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <select name="action_type" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input name="outcome" placeholder="Outcome / decision" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <button type="submit" className="sm:col-span-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Save record
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
