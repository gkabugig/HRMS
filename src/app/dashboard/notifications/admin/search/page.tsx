// Area 09 §23 "Search by correlation ID, notification ID, event ID and
// recipient." A single text box tried against all four — the query string
// decides the search term (?q=), so results are a plain server-rendered
// page rather than a client search box wired to an API route.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/employee-portal/empty-state";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default async function NotificationSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let notifications: Record<string, unknown>[] = [];
  let event: Record<string, unknown> | null = null;

  if (q) {
    const term = q.trim();
    if (isUuid(term)) {
      const [byId, byCorrelation, byEvent, byRecipient] = await Promise.all([
        supabase.from("notifications").select("id, title, type, category, priority, recipient_user_id, correlation_id, event_id, created_at").eq("id", term),
        supabase.from("notifications").select("id, title, type, category, priority, recipient_user_id, correlation_id, event_id, created_at").eq("correlation_id", term),
        supabase.from("notifications").select("id, title, type, category, priority, recipient_user_id, correlation_id, event_id, created_at").eq("event_id", term),
        supabase.from("notifications").select("id, title, type, category, priority, recipient_user_id, correlation_id, event_id, created_at").eq("recipient_user_id", term),
      ]);
      const byIdList = [...(byId.data ?? []), ...(byCorrelation.data ?? []), ...(byEvent.data ?? []), ...(byRecipient.data ?? [])];
      const seen = new Set<string>();
      notifications = byIdList.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));

      const { data: eventRow } = await supabase
        .from("notification_events")
        .select("id, event_type, aggregate_type, aggregate_id, correlation_id, processing_status, occurred_at, processed_at, attempt_count, processing_error")
        .or(`id.eq.${term},correlation_id.eq.${term}`)
        .maybeSingle();
      event = eventRow;
    } else {
      const { data } = await supabase
        .from("app_users")
        .select("id")
        .ilike("email", `%${term}%`)
        .limit(1)
        .maybeSingle();
      if (data) {
        const { data: byUser } = await supabase
          .from("notifications")
          .select("id, title, type, category, priority, recipient_user_id, correlation_id, event_id, created_at")
          .eq("recipient_user_id", data.id)
          .order("created_at", { ascending: false })
          .limit(25);
        notifications = byUser ?? [];
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Notification Search</h1>
        <Link href="/dashboard/notifications/admin" className="text-xs font-medium text-brand-600 hover:underline">← Admin Centre</Link>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Notification ID, correlation ID, event ID, or recipient email"
          className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium">Search</button>
      </form>

      {q && (
        <>
          {event && (
            <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 text-sm">
              <p className="font-semibold text-neutral-900 mb-1">Source event</p>
              <p className="text-xs text-neutral-500">
                {String(event.event_type)} · status {String(event.processing_status)} · attempts {String(event.attempt_count)}
                {event.processing_error ? ` · error: ${String(event.processing_error)}` : ""}
              </p>
            </div>
          )}
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
            {notifications.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Title</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Correlation</th>
                    <th className="px-4 py-2 font-medium">Recipient</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={String(n.id)} className="border-t border-neutral-100">
                      <td className="px-4 py-2 text-neutral-900">{String(n.title)}</td>
                      <td className="px-4 py-2 text-neutral-700 text-xs font-mono">{String(n.type)}</td>
                      <td className="px-4 py-2 text-neutral-400 text-[11px] font-mono">{String(n.correlation_id ?? "—").slice(0, 8)}</td>
                      <td className="px-4 py-2 text-neutral-400 text-[11px] font-mono">{String(n.recipient_user_id).slice(0, 8)}</td>
                      <td className="px-4 py-2 text-neutral-500 text-xs">{new Date(String(n.created_at)).toLocaleString("en-KE")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4"><EmptyState message="No matching notifications." /></div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
