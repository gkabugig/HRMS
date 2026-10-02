import Link from "next/link";
import { UserPlus, Wallet, CalendarCheck, Briefcase, FileText, Download, UserMinus } from "lucide-react";
import type { UserRole } from "@/lib/auth/roles";

type QuickAction = { label: string; href: string; icon: typeof UserPlus; roles: UserRole[] };

// spec §14 — role visibility per action. Capped at 8, kept to the ones this
// app already has a real destination for (no dialogs invented for actions
// the app doesn't support yet, e.g. a standalone "Generate report" flow).
const ACTIONS: QuickAction[] = [
  { label: "Add Employee", href: "/dashboard/employees", icon: UserPlus, roles: ["admin", "hr"] },
  { label: "Run Payroll", href: "/dashboard/payroll", icon: Wallet, roles: ["admin", "hr"] },
  { label: "Approve Leave", href: "/dashboard/leave", icon: CalendarCheck, roles: ["admin", "hr", "manager"] },
  { label: "Post Vacancy", href: "/dashboard/recruitment", icon: Briefcase, roles: ["admin", "hr"] },
  { label: "Upload Document", href: "/dashboard/documents", icon: FileText, roles: ["admin", "hr", "manager"] },
  { label: "View Reports", href: "/dashboard/reports", icon: Download, roles: ["admin", "hr"] },
  { label: "Start Offboarding", href: "/dashboard/offboarding", icon: UserMinus, roles: ["admin", "hr"] },
];

export default function QuickActions({ role }: { role: UserRole }) {
  const visible = ACTIONS.filter((a) => a.roles.includes(role));
  if (visible.length === 0) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Quick Actions</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {visible.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] py-3 px-2 text-center hover:border-brand-300 hover:bg-brand-50/50 transition-colors"
          >
            <a.icon size={17} className="text-brand-600" strokeWidth={2} />
            <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
