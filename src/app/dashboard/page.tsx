import { createClient } from "@/lib/supabase/server";
import { Users, Briefcase, CalendarClock } from "lucide-react";

const STAT_ICONS = [Users, Briefcase, CalendarClock];
const STAT_ACCENTS = [
  { bg: "bg-brand-50", text: "text-brand-600" },
  { bg: "bg-accent-500/10", text: "text-accent-600" },
  { bg: "bg-amber-50", text: "text-amber-600" },
];

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const role = appUser?.role;
  const isHrLike = role === "admin" || role === "hr";
  const displayName = user?.email?.split("@")[0] ?? "there";

  let stats: { label: string; value: number }[] = [];

  if (isHrLike) {
    const [{ count: employeeCount }, { count: openReqs }, { count: pendingLeave }] =
      await Promise.all([
        supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "Active"),
        supabase.from("requisitions").select("*", { count: "exact", head: true }).eq("status", "Open"),
        supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "Pending"),
      ]);
    stats = [
      { label: "Active employees", value: employeeCount ?? 0 },
      { label: "Open requisitions", value: openReqs ?? 0 },
      { label: "Pending leave requests", value: pendingLeave ?? 0 },
    ];
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight capitalize">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">Here&apos;s what&apos;s happening across the org.</p>
      </div>
      {isHrLike ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s, i) => {
            const Icon = STAT_ICONS[i];
            const accent = STAT_ACCENTS[i];
            return (
              <div
                key={s.label}
                className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5"
              >
                <div className={`h-9 w-9 rounded-lg ${accent.bg} ${accent.text} flex items-center justify-center mb-3`}>
                  <Icon size={18} strokeWidth={2} />
                </div>
                <div className="text-2xl font-semibold text-neutral-900">{s.value}</div>
                <div className="text-sm text-neutral-500">{s.label}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-neutral-600">
          Use the menu on the left for your leave, payslips, and appraisals.
        </p>
      )}
    </div>
  );
}
