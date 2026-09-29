import { createClient } from "@/lib/supabase/server";

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
      <h1 className="text-lg font-semibold text-neutral-900 mb-4">Dashboard</h1>
      {isHrLike ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white border border-neutral-200 rounded-lg p-4">
              <div className="text-2xl font-semibold text-neutral-900">{s.value}</div>
              <div className="text-sm text-neutral-500">{s.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-600">
          Use the tabs above for your leave, payslips, and appraisals.
        </p>
      )}
    </div>
  );
}
