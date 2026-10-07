import Link from "next/link";
import { getRewardContext, mergePolicy } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { calibrateRecommendation, closeCalibrationSession, openCalibrationSession } from "@/lib/rewards/calibration-actions";
import { loadCalRows } from "@/lib/rewards/calibration-data";
import { calibrationFlags, ratingDistribution, type CalRow } from "@/lib/rewards/calibration-engine";
import { BTN, BTN_GHOST, Empty, INPUT, PageHead, Panel, StatusChip } from "../ui";

type Dist = { rating: string; count: number; share: number }[];

function DistTable({ title, rows, order }: { title: string; rows: Map<string, CalRow[]>; order: string[] }) {
  return (
    <Panel title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1.5 pr-3 font-medium">Group</th>
              {order.map((o) => <th key={o} className="py-1.5 px-2 font-medium text-right">{o}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {[...rows.entries()].sort().map(([g, list]) => {
              const d = ratingDistribution(list, order);
              return (
                <tr key={g}>
                  <td className="py-1.5 pr-3 text-neutral-900 dark:text-neutral-50">{g} <span className="text-neutral-400">({list.length})</span></td>
                  {d.map((x) => <td key={x.rating} className="py-1.5 px-2 text-right tabular-nums">{x.count} <span className="text-neutral-400">· {Math.round(x.share)}%</span></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const group = (rows: CalRow[], key: (r: CalRow) => string) => rows.reduce((m, r) => (m.get(key(r))?.push(r) ?? m.set(key(r), [r]), m), new Map<string, CalRow[]>());

export default async function CalibrationPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const { cycle: cycleId } = await searchParams;
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>Calibration is run by HR.</Empty>;
  const { data: cycles } = await supabase.from("reward_cycles").select("id, name, status, policy_id").eq("org_id", orgId).order("created_at", { ascending: false });
  const cycle = (cycles ?? []).find((c) => c.id === cycleId) ?? (cycles ?? []).find((c) => c.status === "Calibration") ?? (cycles ?? [])[0];
  const head = <PageHead title="Calibration" subtitle="Compare ratings and recommendations across managers and departments. Flags are prompts to look, not findings." role={role} current="/dashboard/rewards/calibration" />;
  if (!cycle) return <div className="space-y-6">{head}<Empty>No reward cycles yet.</Empty></div>;

  const [{ data: sessions }, { data: pol }, rows] = await Promise.all([
    supabase.from("calibration_sessions").select("*").eq("cycle_id", cycle.id).order("opened_at", { ascending: false }),
    supabase.from("reward_policies").select("config").eq("id", cycle.policy_id).maybeSingle(),
    loadCalRows(supabase, orgId, cycle.id as string),
  ]);
  const order = [...mergePolicy(pol?.config).bands].sort((a, b) => b.min - a.min).map((b) => b.rating);
  const open = (sessions ?? []).find((s) => s.status === "Open");
  const merit = rows.filter((r) => r.rewardType === "merit" && !r.excluded);
  const flags = calibrationFlags(rows, order);
  const byRec = new Map(rows.map((r) => [r.recId, r]));

  return (
    <div className="space-y-6">
      {head}
      <div className="flex flex-wrap gap-2">
        {(cycles ?? []).map((c) => (
          <Link key={c.id as string} href={`/dashboard/rewards/calibration?cycle=${c.id}`} className={`text-xs rounded-full px-3 py-1.5 border ${c.id === cycle.id ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900" : "border-[var(--border-subtle)] text-neutral-600 dark:text-neutral-300"}`}>{c.name as string}</Link>
        ))}
      </div>

      <Panel title="Session" right={<StatusChip status={cycle.status as string} />}>
        {open ? (
          <div className="space-y-2">
            <p className="text-sm text-neutral-700 dark:text-neutral-200">Open since {new Date(open.opened_at as string).toLocaleString("en-KE")}. Managers involved: {(open.participants as string[]).join(", ") || "none"}.</p>
            <p className="text-xs text-neutral-500">{(open.decisions as unknown[]).length} change(s) recorded. Closing stores the before and after distributions and moves the cycle to Approval.</p>
            <ActionForm action={closeCalibrationSession.bind(null, open.id as string)} successMessage="Session closed. The cycle is now in Approval." resetOnSuccess={false}>
              <button className={BTN}>Close session</button>
            </ActionForm>
          </div>
        ) : cycle.status === "Calibration" ? (
          <ActionForm action={openCalibrationSession.bind(null, cycle.id as string)} successMessage="Session opened." resetOnSuccess={false}>
            <button className={BTN}>Open a calibration session</button>
          </ActionForm>
        ) : (
          <p className="text-sm text-neutral-500">Sessions run while a cycle is in Calibration. This one is {String(cycle.status)}.</p>
        )}
      </Panel>

      <DistTable title="Ratings by manager" rows={group(merit, (r) => r.managerName)} order={order} />
      <DistTable title="Ratings by department" rows={group(merit, (r) => r.department)} order={order} />

      <Panel title={`Flags (${flags.length})`} subtitle="Thresholds: skew +20 points, override gap 15%, department variance 1.5 points, fixed defaults for now.">
        {flags.length === 0 ? (
          <Empty>Nothing unusual found.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {flags.map((f, i) => {
              const r = f.recId ? byRec.get(f.recId) : undefined;
              return (
                <li key={i} className="py-2.5">
                  <p className="text-sm text-neutral-900 dark:text-neutral-50"><span className="text-[11px] font-medium rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 mr-2">{f.label}</span>{f.detail}</p>
                  {open && r && (
                    <ActionForm action={calibrateRecommendation.bind(null, open.id as string, r.recId)} successMessage="Change applied." className="flex flex-wrap items-end gap-2 mt-2">
                      <input name="value" type="number" step="0.01" required placeholder={r.rewardType === "merit" ? "New increase %" : "New amount KES"} className={`${INPUT} !w-40`} />
                      <input name="reason" required placeholder="Reason agreed in the session" className={`${INPUT} !w-72`} />
                      <button className={BTN_GHOST}>Apply</button>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {(sessions ?? []).filter((s) => s.status === "Closed").map((s) => (
        <Panel key={s.id as string} title={`Closed ${new Date(s.closed_at as string).toLocaleDateString("en-KE")}`} subtitle={`${(s.decisions as unknown[]).length} change(s)`}>
          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            {([["Before", s.before_dist], ["After", s.after_dist]] as const).map(([l, d]) => (
              <div key={l}>
                <p className="font-semibold mb-1 text-neutral-700 dark:text-neutral-200">{l}</p>
                {((d ?? []) as Dist).map((x) => <p key={x.rating} className="text-neutral-600 dark:text-neutral-300">{x.rating}: {x.count} ({Math.round(x.share)}%)</p>)}
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
