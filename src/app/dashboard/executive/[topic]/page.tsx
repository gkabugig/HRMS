// Read-only executive detail for the head of organisation (CEO). Her login
// role is Manager, so the normal Payroll / Disciplinary / Rewards pages would
// show her only her own data. The identity check uses her own session; only
// then is the privileged client used, and only to read summaries.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isHeadOfOrganisation } from "@/lib/approvals/head-of-organisation";
import { loadReportInput } from "@/lib/rewards/report-data";
import { buildReport } from "@/lib/rewards/report-engine";

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 mb-3">{subtitle}</p>}
      <div className="mt-3 overflow-x-auto">{children}</div>
    </div>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-400 py-4 text-center">Nothing to show yet.</p>;
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-left text-neutral-500">{columns.map((c) => <th key={c} className="py-1.5 pr-3 font-medium">{c}</th>)}</tr></thead>
      <tbody className="divide-y divide-[var(--border-subtle)]">
        {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="py-1.5 pr-3 text-neutral-900 dark:text-neutral-50 tabular-nums">{typeof v === "number" && v >= 1000 ? v.toLocaleString("en-KE") : v}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

export default async function ExecutiveTopic({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!["payroll", "disciplinary", "rewards"].includes(topic)) notFound();
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) notFound();
  const { data: appUser } = await userClient.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser?.employee_id || !(await isHeadOfOrganisation(userClient, appUser.employee_id as string))) notFound();
  const orgId = appUser.org_id as string;
  const db = createAdminClient();

  let title = "";
  let body: React.ReactNode = null;

  if (topic === "payroll") {
    title = "Payroll cost";
    const { data: runs } = await db.from("payroll_runs").select("period, status, payslips(gross, net)").eq("org_id", orgId).order("period", { ascending: false }).limit(12);
    const rows = (runs ?? []).map((r) => {
      const p = (r.payslips ?? []) as { gross: number; net: number }[];
      return [r.period as string, String(r.status).replace("_", " "), p.length, kes(p.reduce((s, x) => s + Number(x.gross), 0)), kes(p.reduce((s, x) => s + Number(x.net), 0))];
    });
    body = <Card title="Last 12 payroll runs" subtitle="Totals only. Individual pay is not shown here."><Table columns={["Period", "Status", "Employees", "Gross pay", "Net pay"]} rows={rows} /></Card>;
  } else if (topic === "disciplinary") {
    title = "Disciplinary overview";
    const { data: cases } = await db.from("disciplinary_actions").select("action_type, outcome, hearing_date, employees!inner(org_id, department)").eq("employees.org_id", orgId);
    const list = cases ?? [];
    const open = list.filter((c) => !c.outcome);
    const byType = new Map<string, number>();
    for (const c of list) byType.set((c.action_type as string) ?? "Not set", (byType.get((c.action_type as string) ?? "Not set") ?? 0) + 1);
    const byDept = new Map<string, number>();
    for (const c of open) {
      const d = (c.employees as unknown as { department: string } | null)?.department ?? "—";
      byDept.set(d, (byDept.get(d) ?? 0) + 1);
    }
    body = (
      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Open cases" subtitle="No outcome recorded yet. Names are not shown here."><Table columns={["Department", "Open cases"]} rows={[...byDept.entries()]} /></Card>
        <Card title={`All cases (${list.length})`} subtitle="By action type."><Table columns={["Action", "Cases"]} rows={[...byType.entries()]} /></Card>
      </div>
    );
  } else {
    title = "Rewards overview";
    const { input } = await loadReportInput(db, orgId, {});
    const sections = [...buildReport("pools", input).sections, ...buildReport("pipeline", input).sections.slice(0, 1), ...buildReport("exceptions", input).sections];
    body = (
      <div className="space-y-6">
        {sections.map((s) => <Card key={s.heading} title={s.heading}><Table columns={s.columns} rows={s.rows} /></Card>)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">{title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Read-only view for the head of the organisation. <Link href="/dashboard" className="text-brand-600 underline">Back to the dashboard</Link></p>
      </div>
      {body}
    </div>
  );
}
