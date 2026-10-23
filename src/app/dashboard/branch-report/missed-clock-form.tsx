"use client";

import ActionForm from "@/components/forms/action-form";
import { BTN, INPUT, LABEL } from "@/components/ui/page-kit";
import { requestMissedClock } from "@/lib/branch-ops/report-actions";

export default function MissedClockForm({ branchId, staff, today }: { branchId: string; staff: { id: string; name: string }[]; today: string }) {
  return (
    <ActionForm action={requestMissedClock} successMessage="Sent to the owners for approval." className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
      <input type="hidden" name="branch_id" value={branchId} />
      <label>
        <span className={LABEL}>Staff member</span>
        <select name="employee_id" required className={INPUT}>
          <option value="">Choose…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={LABEL}>Date</span>
        <input type="date" name="work_date" max={today} defaultValue={today} required className={INPUT} />
      </label>
      <label>
        <span className={LABEL}>Missed</span>
        <select name="field" className={INPUT}>
          <option value="clock_in">Clock in</option>
          <option value="clock_out">Clock out</option>
        </select>
      </label>
      <label>
        <span className={LABEL}>Correct time</span>
        <input type="time" name="requested_value" required className={INPUT} />
      </label>
      <label className="sm:col-span-4">
        <span className={LABEL}>Reason</span>
        <input name="reason" required minLength={5} placeholder="e.g. Kiosk was offline when she arrived" className={INPUT} />
      </label>
      <button className={BTN}>Send for approval</button>
    </ActionForm>
  );
}
