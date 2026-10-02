import Link from "next/link";

export const TAB_KEYS = [
  "overview",
  "bio",
  "employment",
  "payroll",
  "attendance",
  "leave",
  "performance",
  "learning",
  "compliance",
  "documents",
  "assets",
  "activity",
] as const;

export type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  overview: "Overview",
  bio: "Bio",
  employment: "Employment",
  payroll: "Payroll",
  attendance: "Attendance",
  leave: "Leave",
  performance: "Performance",
  learning: "Learning",
  compliance: "Compliance",
  documents: "Documents",
  assets: "Assets",
  activity: "Activity",
};

export function parseTab(tab: string | undefined): TabKey {
  return (TAB_KEYS as readonly string[]).includes(tab ?? "") ? (tab as TabKey) : "overview";
}

// Plain server-rendered links — switching tabs is just a query-param
// navigation, so the initial profile shell stays fast with no client JS
// required to move between tabs.
export function EmployeeTabs({ employeeId, active }: { employeeId: string; active: TabKey }) {
  return (
    <div className="border-b border-[var(--border-subtle)] overflow-x-auto">
      <nav className="flex gap-1 min-w-max px-1">
        {TAB_KEYS.map((key) => (
          <Link
            key={key}
            href={`/dashboard/employees/${employeeId}?tab=${key}`}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              key === active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 hover:dark:text-neutral-100"
            }`}
          >
            {TAB_LABELS[key]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
