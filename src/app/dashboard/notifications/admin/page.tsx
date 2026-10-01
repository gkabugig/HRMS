// Area 09 §23 Admin Notification Centre — overview: volume/failure metrics,
// provider health, failed-delivery queue, dead-letter queue, suppression
// controls + test-send. RLS (notifications_hr_admin_read and the various
// *_hr_all policies) is what actually restricts this to admin/hr sessions —
// a manager or employee opening this URL sees empty tables, not an error.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EVENT_CATALOGUE } from "@/lib/notifications/event-catalogue";
import { createSuppression, endSuppression, resolveDeadLetter, retryFailedDelivery, sendTestNotification } from "@/lib/notifications/admin-actions";
import EmptyState from "@/components/employee-portal/empty-state";

function sevenDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export default async function NotificationAdminPage() {
  const supabase = await createClient();

  const [
    { count: totalLast7d },
    { count: failedCount },
    { count: deadLetterOpenCount },
    { data: failedDeliveries },
    { data: deadLetters },
    { data: suppressions },
  ] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgoIso()),
    supabase.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("notification_dead_letters").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supabase
      .from("notification_deliveries")
      .select("id, channel, error_code, error_message, attempt_count, last_attempt_at, notifications(title, recipient_user_id, correlation_id)")
      .eq("status", "failed")
      .order("last_attempt_at", { ascending: false })
      .limit(25),
    supabase
      .from("notification_dead_letters")
      .select("id, channel, failure_reason, created_at, notification_id")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("notification_suppressions")
      .select("id, user_id, category, channel, starts_at, ends_at, reason")
      .order("starts_at", { ascending: false })
      .limit(25),
  ]);

  // Provider health: whether the email adapter actually has credentials
  // configured — read here (server component, not the client channel
  // adapter) purely to report status, never to print the key itself.
  const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.NOTIFICATIONS_EMAIL_FROM);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Notification Admin Centre</h1>
          <p className="text-sm text-neutral-500 mt-1">Delivery health, policy, templates and suppression controls.</p>
        </div>
        <nav className="flex gap-3 text-xs font-medium text-brand-600">
          <Link href="/dashboard/notifications/admin/policies" className="hover:underline">Event → policy mapping</Link>
          <Link href="/dashboard/notifications/admin/templates" className="hover:underline">Templates</Link>
          <Link href="/dashboard/notifications/admin/search" className="hover:underline">Search</Link>
        </nav>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Metric label="Sent (7 days)" value={totalLast7d ?? 0} />
        <Metric label="Failed deliveries (open)" value={failedCount ?? 0} tone={failedCount ? "warn" : "ok"} />
        <Metric label="Dead letters (unresolved)" value={deadLetterOpenCount ?? 0} tone={deadLetterOpenCount ? "bad" : "ok"} />
        <Metric label="Email provider" value={emailConfigured ? "Configured" : "Not configured"} tone={emailConfigured ? "ok" : "warn"} isText />
      </div>
      {!emailConfigured && (
        <p className="text-xs text-neutral-400 -mt-3">
          RESEND_API_KEY / NOTIFICATIONS_EMAIL_FROM aren&apos;t set — email deliveries report <code>provider_not_configured</code> and
          dead-letter immediately. In-app notifications are unaffected.
        </p>
      )}

      <Section title="Failed delivery queue">
        {failedDeliveries && failedDeliveries.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Notification</th>
                <th className="px-4 py-2 font-medium">Channel</th>
                <th className="px-4 py-2 font-medium">Error</th>
                <th className="px-4 py-2 font-medium">Attempts</th>
                <th className="px-4 py-2 font-medium">Correlation</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(failedDeliveries as unknown as {
                id: string;
                channel: string;
                error_code: string | null;
                error_message: string | null;
                attempt_count: number;
                notifications: { title: string; correlation_id: string | null } | null;
              }[]).map((d) => (
                <tr key={d.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-900">{d.notifications?.title ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-700">{d.channel}</td>
                  <td className="px-4 py-2 text-red-600 text-xs">{d.error_code ?? d.error_message ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">{d.attempt_count}</td>
                  <td className="px-4 py-2 text-neutral-400 text-[11px] font-mono">{d.notifications?.correlation_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-4 py-2">
                    <form action={retryFailedDelivery}>
                      <input type="hidden" name="id" value={d.id} />
                      <button type="submit" className="text-xs text-brand-600 hover:underline">Retry</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4"><EmptyState message="No failed deliveries." /></div>
        )}
      </Section>

      <Section title="Dead-letter queue">
        {deadLetters && deadLetters.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Channel</th>
                <th className="px-4 py-2 font-medium">Failure reason</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {deadLetters.map((dl) => (
                <tr key={dl.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-700">{dl.channel ?? "—"}</td>
                  <td className="px-4 py-2 text-red-600 text-xs">{dl.failure_reason}</td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">{new Date(dl.created_at).toLocaleString("en-KE")}</td>
                  <td className="px-4 py-2">
                    <form action={resolveDeadLetter}>
                      <input type="hidden" name="id" value={dl.id} />
                      <button type="submit" className="text-xs text-brand-600 hover:underline">Mark resolved</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4"><EmptyState message="No unresolved dead letters." /></div>
        )}
      </Section>

      <Section title="Suppressions">
        <div className="p-4 border-b border-neutral-100">
          <form action={createSuppression} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
            <input name="user_id" placeholder="User ID (blank = org-wide)" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="category" placeholder="Category (blank = all)" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="channel" placeholder="Channel (blank = all)" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="ends_at" type="datetime-local" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="reason" placeholder="Reason (required, audited)" required className="border border-neutral-200 rounded px-2 py-1.5 sm:col-span-1" />
            <button type="submit" className="sm:col-span-5 bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium w-fit">
              Create suppression
            </button>
          </form>
        </div>
        {suppressions && suppressions.length > 0 ? (
          <ul className="divide-y divide-neutral-50 text-sm">
            {suppressions.map((s) => {
              const active = !s.ends_at || new Date(s.ends_at) > new Date();
              return (
                <li key={s.id} className="px-4 py-2 flex items-center justify-between gap-3">
                  <span className="text-neutral-700">
                    {s.user_id ? `User ${s.user_id.slice(0, 8)}…` : "Org-wide"} · {s.category ?? "all categories"} · {s.channel ?? "all channels"}
                    <span className="block text-xs text-neutral-400">{s.reason}</span>
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${active ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-400"}`}>
                    {active ? "Active" : "Ended"}
                  </span>
                  {active && (
                    <form action={endSuppression}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="text-xs text-brand-600 hover:underline">End now</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-4"><EmptyState message="No suppressions configured." /></div>
        )}
      </Section>

      <Section title="Test-send">
        <form action={sendTestNotification} className="p-4 space-y-2 text-xs">
          <p className="text-neutral-400">
            Sends a real in-app notification to your own account only — never to another employee — so you can confirm a template/policy
            renders as expected.
          </p>
          <select name="event_type" className="border border-neutral-200 rounded px-2 py-1.5 w-full sm:w-auto" required>
            {Object.keys(EVENT_CATALOGUE).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input name="title" placeholder="Title (optional)" className="border border-neutral-200 rounded px-2 py-1.5 w-full" />
          <textarea name="message" placeholder="Message (optional)" className="border border-neutral-200 rounded px-2 py-1.5 w-full" rows={2} />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">
            Send test to myself
          </button>
        </form>
      </Section>
    </div>
  );
}

function Metric({ label, value, tone = "neutral", isText = false }: { label: string; value: number | string; tone?: "ok" | "warn" | "bad" | "neutral"; isText?: boolean }) {
  const toneClass = { ok: "text-green-700", warn: "text-amber-700", bad: "text-red-700", neutral: "text-neutral-900" }[tone];
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 font-semibold ${isText ? "text-sm" : "text-2xl"} ${toneClass}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-900 mb-2">{title}</h2>
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        {children}
      </div>
    </section>
  );
}

