"use client";

import Link from "next/link";

export type ApprovalTab = "pending" | "delegated" | "submitted" | "overdue" | "completed" | "all";

const BASE_TABS: { key: ApprovalTab; label: string }[] = [
  { key: "pending", label: "Pending for Me" },
  { key: "delegated", label: "Delegated to Me" },
  { key: "submitted", label: "Submitted by Me" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Recently Completed" },
];

export default function ApprovalTabsNav({ active, isAdminOrHr }: { active: ApprovalTab; isAdminOrHr: boolean }) {
  const tabs = isAdminOrHr ? [...BASE_TABS, { key: "all" as const, label: "All Requests" }] : BASE_TABS;

  return (
    <div className="flex gap-1 border-b border-[var(--border-subtle)] overflow-x-auto">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "pending" ? "/dashboard/approvals" : `/dashboard/approvals?tab=${t.key}`}
          className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
            active === t.key
              ? "border-brand-600 text-brand-700 font-medium"
              : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 hover:dark:text-neutral-100"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
