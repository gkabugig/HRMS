"use client";

// Filters are plain GET params (?from=&to=&category=&resource=&risk=&q=) so
// the page stays a server component doing the actual query — this client
// component only renders the filter form + the expandable rows.
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AuditEventCategory, AuditEventRow, AuditRiskLevel } from "@/lib/audit/get-audit-trail";

const RISK_STYLE: Record<AuditRiskLevel, string> = {
  normal: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300",
  elevated: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

export default function AuditEventsTable({
  events,
  resourceTypes,
  categories,
  riskLevels,
  filters,
}: {
  events: AuditEventRow[];
  resourceTypes: string[];
  categories: AuditEventCategory[];
  riskLevels: AuditRiskLevel[];
  filters: { from: string; to: string; category: string; resource: string; risk: string; q: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/dashboard/audit-log?${next.toString()}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          From
          <input
            type="date"
            defaultValue={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          To
          <input
            type="date"
            defaultValue={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          Category
          <select
            defaultValue={filters.category}
            onChange={(e) => updateFilter("category", e.target.value)}
            className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-neutral-900"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          Resource
          <select
            defaultValue={filters.resource}
            onChange={(e) => updateFilter("resource", e.target.value)}
            className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-neutral-900"
          >
            <option value="">All</option>
            {resourceTypes.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          Risk
          <select
            defaultValue={filters.risk}
            onChange={(e) => updateFilter("risk", e.target.value)}
            className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-neutral-900"
          >
            <option value="">All</option>
            {riskLevels.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400 flex-1 min-w-[160px]">
          Search action / resource
          <input
            type="text"
            defaultValue={filters.q}
            onChange={(e) => updateFilter("q", e.target.value)}
            placeholder="e.g. leave, approve, employee"
            className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium w-6"></th>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Resource</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const isOpen = expanded === ev.id;
              const hasDetail = ev.before_json || ev.after_json || ev.metadata_json;
              return (
                <>
                  <tr
                    key={ev.id}
                    className={`border-t border-neutral-100 dark:border-neutral-800 ${hasDetail ? "cursor-pointer hover:bg-neutral-50 hover:dark:bg-neutral-900" : ""}`}
                    onClick={() => hasDetail && setExpanded(isOpen ? null : ev.id)}
                  >
                    <td className="px-4 py-2 text-neutral-400 dark:text-neutral-500">
                      {hasDetail && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString("en-KE")}
                    </td>
                    <td className="px-4 py-2">{ev.actor_name ?? ev.actor_role ?? "System"}</td>
                    <td className="px-4 py-2 font-medium">{ev.action}</td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 font-mono text-xs">{ev.resource_type}</td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{ev.event_category}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_STYLE[ev.risk_level]}`}>
                        {ev.risk_level}
                      </span>
                    </td>
                  </tr>
                  {isOpen && hasDetail && (
                    <tr className="border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/60">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid sm:grid-cols-3 gap-3 text-xs">
                          {ev.before_json && (
                            <div>
                              <div className="font-semibold text-neutral-600 dark:text-neutral-300 mb-1">Before</div>
                              <pre className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 overflow-x-auto">
                                {JSON.stringify(ev.before_json, null, 2)}
                              </pre>
                            </div>
                          )}
                          {ev.after_json && (
                            <div>
                              <div className="font-semibold text-neutral-600 dark:text-neutral-300 mb-1">After</div>
                              <pre className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 overflow-x-auto">
                                {JSON.stringify(ev.after_json, null, 2)}
                              </pre>
                            </div>
                          )}
                          {ev.metadata_json && (
                            <div>
                              <div className="font-semibold text-neutral-600 dark:text-neutral-300 mb-1">Metadata</div>
                              <pre className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 overflow-x-auto">
                                {JSON.stringify(ev.metadata_json, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                  No events recorded yet for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
