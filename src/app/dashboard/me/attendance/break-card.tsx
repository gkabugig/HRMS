import ActionForm from "@/components/forms/action-form";
import { BTN, BTN_GHOST, INPUT } from "@/components/ui/page-kit";
import { endBreak, startBreak } from "@/lib/attendance/break-actions";

export type BreakRow = { id: string; kind: string; started_at: string; ended_at: string | null };

const mins = (b: BreakRow) => Math.max(0, Math.round(((b.ended_at ? new Date(b.ended_at).getTime() : Date.now()) - new Date(b.started_at).getTime()) / 60000));
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

// Shown while the person is clocked in and has not yet clocked out.
export function BreakCard({ breaks, active }: { breaks: BreakRow[]; active: boolean }) {
  const open = breaks.find((b) => !b.ended_at);
  const total = breaks.reduce((s, b) => s + mins(b), 0);
  return (
    <div className="space-y-2">
      {active &&
        (open ? (
          <ActionForm action={endBreak} successMessage="Back on shift." resetOnSuccess={false}>
            <p className="text-xs text-amber-700 mb-2">On a {open.kind} break since {time(open.started_at)} ({mins(open)} min)</p>
            <button className={BTN}>Resume shift</button>
          </ActionForm>
        ) : (
          <ActionForm action={startBreak} successMessage="Break started." resetOnSuccess={false} className="flex items-center gap-2">
            <select name="kind" className={`${INPUT} !w-auto`}>
              <option value="lunch">Lunch</option>
              <option value="tea">Tea</option>
              <option value="other">Other</option>
            </select>
            <button className={BTN_GHOST}>Start break</button>
          </ActionForm>
        ))}
      {breaks.length > 0 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Breaks today: {breaks.map((b) => `${b.kind} ${time(b.started_at)}${b.ended_at ? `–${time(b.ended_at)}` : " (running)"}`).join(", ")} · {total} min in total
        </p>
      )}
    </div>
  );
}
