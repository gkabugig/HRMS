"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { FormResult } from "@/lib/actions/form-result";
import { submitBranchReport } from "@/lib/branch-ops/report-actions";
import { cashVariance, parseAmount, varianceFlagged } from "@/lib/branch-ops/rules";
import { BTN, Chip, INPUT, LABEL, Panel } from "@/components/ui/page-kit";

export type ReportDefaults = { values: Record<string, string>; remarks: Record<string, string> };

type RegisterView = {
  employeeId: string;
  name: string;
  status: string;
  tone: "green" | "amber" | "red" | "neutral" | "blue";
  clockIn: string | null;
  clockOut: string | null;
  minutesLate: number;
  breakMinutes: number;
};

// Phone photos of bank slips are often 3-6 MB; shrink them before upload so
// a report goes through on a weak connection.
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 700 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

async function submitWithShrunkFiles(prev: FormResult, fd: FormData): Promise<FormResult> {
  for (const key of ["bank_slip", "receipt"]) {
    const files = fd.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);
    fd.delete(key);
    for (const f of files) fd.append(key, await shrinkImage(f));
  }
  return submitBranchReport(prev, fd);
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Panel title={`${n}. ${title}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
    </Panel>
  );
}

export default function ReportForm({
  branchId,
  reportDate,
  threshold,
  defaults,
  register,
  firstClockIn,
}: {
  branchId: string;
  reportDate: string;
  threshold: number;
  defaults: ReportDefaults | null;
  register: RegisterView[];
  firstClockIn: string;
}) {
  const [state, action, pending] = useActionState(submitWithShrunkFiles, {} as FormResult);
  const d = (k: string) => defaults?.values[k] ?? "";
  const [money, setMoney] = useState<Record<string, string>>({
    phones_value: d("phones_value"),
    accessories_value: d("accessories_value"),
    services_value: d("services_value"),
    pay_cash: d("pay_cash"),
    pay_mpesa: d("pay_mpesa"),
    pay_card: d("pay_card"),
    pay_credit: d("pay_credit"),
    opening_float: d("opening_float"),
    cash_banked: d("cash_banked"),
    petty_cash_total: d("petty_cash_total"),
    closing_cash: d("closing_cash"),
  });
  const [incident, setIncident] = useState(d("incident_type") || "none");
  const n = (k: string) => parseAmount(money[k] ?? "") ?? 0;
  const sales = n("phones_value") + n("accessories_value") + n("services_value");
  const paid = n("pay_cash") + n("pay_mpesa") + n("pay_card") + n("pay_credit");
  const variance = cashVariance({ openingFloat: n("opening_float"), cashSales: n("pay_cash"), pettyCash: n("petty_cash_total"), cashBanked: n("cash_banked"), closingCash: n("closing_cash") });
  const flagged = varianceFlagged(variance, threshold);
  const kes = (v: number) => `KES ${v.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

  const moneyField = (name: string, label: string) => (
    <label key={name}>
      <span className={LABEL}>{label}</span>
      <input name={name} inputMode="decimal" value={money[name]} onChange={(e) => setMoney((m) => ({ ...m, [name]: e.target.value }))} placeholder="0" className={INPUT} />
    </label>
  );
  const field = (name: string, label: string, type = "text", placeholder?: string) => (
    <label key={name}>
      <span className={LABEL}>{label}</span>
      <input name={name} type={type} defaultValue={d(name)} placeholder={placeholder} className={INPUT} />
    </label>
  );
  const text = (name: string, label: string, placeholder?: string) => (
    <label key={name} className="sm:col-span-3">
      <span className={LABEL}>{label}</span>
      <textarea name={name} rows={2} defaultValue={d(name)} placeholder={placeholder} className={INPUT} />
    </label>
  );

  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="report_date" value={reportDate} />

      <Section n={1} title="Opening and closing">
        {field("opened_at", "Time opened", "time")}
        {field("closed_at", "Time closed", "time")}
        <p className="text-xs text-neutral-500 dark:text-neutral-400 self-end">{firstClockIn ? `First clock-in today: ${firstClockIn}` : "Nobody has clocked in yet."}</p>
      </Section>

      <Panel title="2. Attendance" subtitle="Filled in from the clocking kiosk. Add a reason next to anyone late, absent or missing a clock-out.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="py-1.5 font-medium">Name</th>
                <th className="py-1.5 font-medium">Status</th>
                <th className="py-1.5 font-medium">In</th>
                <th className="py-1.5 font-medium">Out</th>
                <th className="py-1.5 font-medium">Lunch</th>
                <th className="py-1.5 font-medium w-1/3">Remark</th>
              </tr>
            </thead>
            <tbody>
              {register.map((r) => (
                <tr key={r.employeeId} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5">
                    <Chip tone={r.tone}>{r.status}</Chip> {r.minutesLate > 0 && <span className="text-xs text-amber-700">+{r.minutesLate} min</span>}
                  </td>
                  <td className="py-1.5 tabular-nums">{r.clockIn ?? "—"}</td>
                  <td className="py-1.5 tabular-nums">{r.clockOut ?? "—"}</td>
                  <td className="py-1.5 tabular-nums">{r.breakMinutes ? `${r.breakMinutes} min` : "—"}</td>
                  <td className="py-1.5">
                    <input name={`remark_${r.employeeId}`} defaultValue={defaults?.remarks[r.employeeId] ?? ""} className={INPUT} placeholder={r.status === "Present" ? "" : "Reason"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {register.length === 0 && <p className="text-sm text-neutral-400 py-4">No staff are assigned to this branch.</p>}
        </div>
      </Panel>

      <Section n={3} title="Sales">
        {field("phones_units", "Phones sold (units)", "text", "0")}
        {moneyField("phones_value", "Phones sold (KES)")}
        {field("accessories_units", "Accessories sold (units)", "text", "0")}
        {moneyField("accessories_value", "Accessories sold (KES)")}
        {moneyField("services_value", "Repairs and services (KES)")}
        {field("top_models", "Top 3 models sold", "text", "e.g. Tecno Spark 30, A16, Redmi 14C")}
        <p className="sm:col-span-3 text-sm font-medium">Total sales: {kes(sales)}</p>
      </Section>

      <Section n={4} title="Payments received">
        {moneyField("pay_cash", "Cash")}
        {moneyField("pay_mpesa", "M-Pesa (till / paybill)")}
        {moneyField("pay_card", "Card")}
        {moneyField("pay_credit", "Credit / Lipa Mdogo Mdogo")}
        <p className={`sm:col-span-2 text-sm self-end ${Math.abs(paid - sales) > 0.5 ? "text-amber-700" : "font-medium"}`}>
          Total received: {kes(paid)}
          {Math.abs(paid - sales) > 0.5 && ` — differs from sales by ${kes(Math.abs(paid - sales))}. Explain in remarks.`}
        </p>
      </Section>

      <Section n={5} title="Cash handling">
        {moneyField("opening_float", "Opening float")}
        {moneyField("cash_banked", "Cash banked or handed over")}
        {field("banking_reference", "Bank slip / M-Pesa reference")}
        {moneyField("petty_cash_total", "Petty cash spent")}
        {field("petty_cash_notes", "Petty cash spent on")}
        {moneyField("closing_cash", "Closing cash counted")}
        <p className={`sm:col-span-3 text-sm ${flagged ? "text-red-600 font-semibold" : "text-neutral-600 dark:text-neutral-300"}`}>
          Cash variance: {kes(variance)} {variance < 0 ? "(short)" : variance > 0 ? "(over)" : "(balanced)"}
          {flagged && ` — above the KES ${threshold.toLocaleString("en-KE")} limit; the owners will be alerted.`}
        </p>
        <label className="sm:col-span-3">
          <span className={LABEL}>Bank slip photos</span>
          <input type="file" name="bank_slip" accept="image/*,application/pdf" capture="environment" multiple className="text-sm" />
        </label>
      </Section>

      <Section n={6} title="Stock">
        {text("stock_received", "Stock received (from which supplier or branch)")}
        {text("stock_transferred", "Stock transferred out")}
        {text("returns_warranty", "Returns and warranty claims")}
        {text("low_stock", "Low-stock items")}
      </Section>

      <Section n={7} title="Expense receipts">
        <label className="sm:col-span-3">
          <span className={LABEL}>Petty cash receipt photos (required if petty cash was spent)</span>
          <input type="file" name="receipt" accept="image/*,application/pdf" capture="environment" multiple className="text-sm" />
        </label>
      </Section>

      <Section n={8} title="Customers">
        {field("walk_ins", "Walk-ins (estimate)")}
        {text("complaints", "Complaints")}
        {text("enquiries", "Enquiries for models we don't stock")}
      </Section>

      <Section n={9} title="Incidents">
        <label>
          <span className={LABEL}>Incident</span>
          <select name="incident_type" value={incident} onChange={(e) => setIncident(e.target.value)} className={INPUT}>
            <option value="none">None</option>
            <option value="theft">Theft</option>
            <option value="damage">Damage</option>
            <option value="security">Security</option>
            <option value="outage">Power or system outage</option>
            <option value="other">Other</option>
          </select>
        </label>
        {incident !== "none" && text("incident_details", "What happened (the owners are alerted)")}
      </Section>

      <Section n={10} title="Remarks and requests">
        {text("remarks", "Anything the owners need to act on")}
      </Section>

      <Panel title="11. Sign-off">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmed" required className="mt-1" />
          <span>I confirm this report is accurate.</span>
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button disabled={pending} className={`${BTN} !text-sm !px-5 !py-2`}>
            {pending ? "Submitting…" : defaults ? "Submit corrected report" : "Submit report"}
          </button>
          {!pending && state.error && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
          {!pending && state.success && (
            <p role="status" className="text-sm text-green-600">
              Report submitted.
            </p>
          )}
        </div>
      </Panel>
    </form>
  );
}
