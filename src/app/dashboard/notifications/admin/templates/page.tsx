// Area 09 §23 "Template management and versioning." Templates are
// immutable once used (enforce_template_immutability trigger, 0084) — this
// page only ever creates a NEW version, never edits an existing row, and
// deactivates the prior version of the same (key, channel, locale) so
// resolveTemplate()'s "latest active" lookup picks it up.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createTemplateVersion } from "@/lib/notifications/admin-actions";
import { EVENT_CATALOGUE } from "@/lib/notifications/event-catalogue";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function NotificationTemplatesPage() {
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("notification_templates")
    .select("id, template_key, version, name, event_type, channel, locale, is_active, is_mandatory, first_used_at, created_at")
    .order("template_key")
    .order("version", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Notification Templates</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Plain <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">{"{{variable}}"}</code> substitution only, HTML-escaped by default — no
            code execution. An event without a template falls back to its built-in default copy.
          </p>
        </div>
        <Link href="/dashboard/notifications/admin" className="text-xs font-medium text-brand-600 hover:underline">← Admin Centre</Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">New template version</h2>
        <form action={createTemplateVersion} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            Template key
            <input name="template_key" required placeholder="e.g. approval-requested" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            Name
            <input name="name" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            Event type
            <select name="event_type" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
              {Object.keys(EVENT_CATALOGUE).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Channel
            <select name="channel" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
              <option value="in_app">in_app</option>
              <option value="email">email</option>
              <option value="sms">sms</option>
              <option value="push">push</option>
              <option value="whatsapp">whatsapp</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Locale
            <input name="locale" defaultValue="en-KE" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            Subject (email only)
            <input name="subject_template" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            Body template
            <textarea name="body_template" required rows={3} className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            Safe preview template (external-channel-safe summary)
            <input name="safe_preview_template" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            Action label
            <input name="action_label_template" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            Action URL
            <input name="action_url_template" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_mandatory" /> Mandatory copy (compliance-reviewed)
          </label>
          <button type="submit" className="sm:col-span-2 bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-2 font-medium w-fit">
            Create version
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        {templates && templates.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">v</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Channel</th>
                <th className="px-4 py-2 font-medium">Locale</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 text-neutral-900 dark:text-neutral-50">{t.name} <span className="text-neutral-400 dark:text-neutral-500 text-xs">({t.template_key})</span></td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{t.version}</td>
                  <td className="px-4 py-2 text-neutral-700 dark:text-neutral-200 text-xs font-mono">{t.event_type}</td>
                  <td className="px-4 py-2 text-neutral-700 dark:text-neutral-200">{t.channel}</td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 text-xs">{t.locale}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.is_active ? "bg-green-100 text-green-700" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500"}`}>
                      {t.is_active ? "Active" : "Superseded"}
                    </span>
                    {t.first_used_at && <span className="ml-1 text-[10px] text-neutral-400 dark:text-neutral-500">locked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4"><EmptyState message="No templates created yet — events fall back to their built-in default copy." /></div>
        )}
      </div>
    </div>
  );
}
