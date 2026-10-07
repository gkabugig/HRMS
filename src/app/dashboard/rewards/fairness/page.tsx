import Link from "next/link";
import { getRewardContext } from "@/lib/rewards/context";
import { loadPeople } from "@/lib/rewards/calibration-data";
import { DEFAULT_THRESHOLDS, fairnessBy, serviceBand, type Person } from "@/lib/rewards/calibration-engine";
import { Empty, PageHead, Panel, kes } from "../ui";

function Table({ title, people, keyFn }: { title: string; people: Person[]; keyFn: (p: Person) => string }) {
  const groups = fairnessBy(people, keyFn);
  return (
    <Panel title={title}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-neutral-500"><th className="py-1.5 font-medium">Group</th><th className="font-medium text-right">People</th><th className="font-medium text-right">Avg merit increase</th><th className="font-medium text-right">Avg bonus</th><th className="font-medium text-right">Promoted</th></tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {groups.map((g) => (
            <tr key={g.group}>
              <td className="py-1.5 text-neutral-900 dark:text-neutral-50">{g.group}</td>
              {g.hidden ? (
                <td colSpan={4} className="text-right text-neutral-400">Fewer than {DEFAULT_THRESHOLDS.minGroupSize} people — hidden</td>
              ) : (
                <>
                  <td className="text-right tabular-nums">{g.count}</td>
                  <td className="text-right tabular-nums">{g.avgMeritPct === null ? "—" : `${g.avgMeritPct.toFixed(1)}%`}</td>
                  <td className="text-right tabular-nums">{g.avgBonus === null ? "—" : kes(g.avgBonus)}</td>
                  <td className="text-right tabular-nums">{g.promoted}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export default async function FairnessPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const { cycle: cycleId } = await searchParams;
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>The fairness report is for HR.</Empty>;
  const { data: cycles } = await supabase.from("reward_cycles").select("id, name, period_start, period_end, effective_date").eq("org_id", orgId).order("created_at", { ascending: false });
  const cycle = (cycles ?? []).find((c) => c.id === cycleId) ?? (cycles ?? [])[0];
  const head = <PageHead title="Fairness report" subtitle="Outcomes by department, grade, gender and length of service. Groups under five people are hidden so no individual can be read from a total." role={role} current="/dashboard/rewards/fairness" />;
  if (!cycle) return <div className="space-y-6">{head}<Empty>No reward cycles yet.</Empty></div>;
  const people = await loadPeople(supabase, orgId, cycle as { id: string; period_start: string; period_end: string; effective_date: string });
  return (
    <div className="space-y-6">
      {head}
      <div className="flex flex-wrap gap-2">
        {(cycles ?? []).map((c) => (
          <Link key={c.id as string} href={`/dashboard/rewards/fairness?cycle=${c.id}`} className={`text-xs rounded-full px-3 py-1.5 border ${c.id === cycle.id ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900" : "border-[var(--border-subtle)] text-neutral-600 dark:text-neutral-300"}`}>{c.name as string}</Link>
        ))}
      </div>
      {people.length === 0 ? (
        <Empty>No recommendations in this cycle yet.</Empty>
      ) : (
        <>
          <Table title="By department" people={people} keyFn={(p) => p.department} />
          <Table title="By grade" people={people} keyFn={(p) => p.grade} />
          <Table title="By gender" people={people} keyFn={(p) => p.gender ?? "Not stated"} />
          <Table title="By length of service" people={people} keyFn={(p) => serviceBand(p.monthsService)} />
        </>
      )}
    </div>
  );
}
