import { getRewardContext, todayIso } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { setLetterRelease } from "@/lib/rewards/letter-actions";
import { BTN, BTN_GHOST, Empty, INPUT, LABEL, PageHead, Panel, StatusChip } from "../ui";

export default async function LettersPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>Reward letters are released by HR.</Empty>;
  const { data: letters } = await supabase.from("reward_letters").select("id, employee_id, letter_type, title, release_date, created_at, employees(name, staff_no)").eq("org_id", orgId).order("created_at", { ascending: false }).limit(200);
  const today = todayIso();
  const held = (letters ?? []).filter((l) => !l.release_date);
  const status = (d: string | null) => (!d ? "Draft" : d <= today ? "Finalised" : "Approved");
  const label = (d: string | null) => (!d ? "Held" : d <= today ? "Released" : `Releases ${d}`);

  return (
    <div className="space-y-6">
      <PageHead title="Reward letters" subtitle="Filed automatically when an outcome is approved. The employee sees a letter only from the release date you set." role={role} current="/dashboard/rewards/letters" />
      <Panel title={`Held (${held.length})`} subtitle="Set one date for every held letter, or release them one by one below.">
        <ActionForm action={setLetterRelease.bind(null, null)} successMessage="Release date set." className="flex flex-wrap items-end gap-3">
          <div><label className={LABEL}>Release date</label><input name="release_date" type="date" required defaultValue={today} className={INPUT} /></div>
          <button className={BTN} disabled={held.length === 0}>Release all held letters</button>
        </ActionForm>
      </Panel>
      <Panel title="All letters">
        {(letters ?? []).length === 0 ? (
          <Empty>No letters yet. They appear when rewards and promotions are approved.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(letters ?? []).map((l) => {
              const e = l.employees as unknown as { name: string; staff_no: string } | null;
              return (
                <li key={l.id as string} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{e?.name ?? "Employee"} <span className="text-xs text-neutral-500 font-normal">· {l.title as string}</span></p>
                    <a className="text-xs text-brand-600 underline" href={`/api/rewards/letters/${l.id}`}>Download</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={status(l.release_date as string | null)} />
                    <span className="text-xs text-neutral-500">{label(l.release_date as string | null)}</span>
                    <ActionForm action={setLetterRelease.bind(null, l.id as string)} successMessage="Date set." resetOnSuccess={false} className="flex items-center gap-1">
                      <input name="release_date" type="date" required defaultValue={(l.release_date as string | null) ?? today} className={`${INPUT} !w-36`} />
                      <button className={BTN_GHOST}>Set</button>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
