import Link from "next/link";
import { notFound } from "next/navigation";
import { pageCtx, type Db } from "@/lib/hub/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { loadRegister, signedUrls } from "@/lib/branch-ops/register";
import { loadSettings } from "@/lib/branch-ops/alerts";
import { varianceFlagged } from "@/lib/branch-ops/rules";
import { Chip, PageTitle, Panel, fmtDate, fmtDateTime } from "@/components/ui/page-kit";
import { NotAllowed } from "../../ops-nav";

const kes = (v: unknown) => `KES ${Number(v ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-t border-neutral-100 dark:border-neutral-800 first:border-t-0 text-sm">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`text-right ${warn ? "text-red-600 font-semibold" : ""}`}>{value === null || value === "" || value === undefined ? "—" : value}</dd>
    </div>
  );
}

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await pageCtx();
  if (!["admin", "hr"].includes(c.role)) return <NotAllowed />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient() as Db;
  const { data: r } = await db.from("branch_daily_reports").select("*, branches(name), submitter:employees!submitted_by_employee(name)").eq("id", id).eq("org_id", c.orgId).maybeSingle();
  if (!r) notFound();

  const [settings, { data: files }, { data: versions }, register] = await Promise.all([
    loadSettings(db, c.orgId),
    db.from("branch_report_files").select("id, kind, storage_path, file_name").eq("report_id", id),
    db.from("branch_daily_reports").select("id, version, submitted_at, submitted_late, is_current").eq("branch_id", r.branch_id).eq("report_date", r.report_date).order("version", { ascending: false }),
    loadRegister(db, { orgId: c.orgId, date: r.report_date, today: nairobiNow().date, branchIds: [r.branch_id] }),
  ]);
  const urls = await signedUrls(db, "branch-report-files", (files ?? []).map((f) => f.storage_path));
  const branch = (Array.isArray(r.branches) ? r.branches[0] : r.branches) as { name: string } | null;
  const by = (Array.isArray(r.submitter) ? r.submitter[0] : r.submitter) as { name: string } | null;
  const remarks = (r.attendance_remarks ?? {}) as Record<string, string>;
  const flagged = varianceFlagged(Number(r.cash_variance), settings.cash_variance_threshold);

  return (
    <div className="space-y-6">
      <PageTitle
        title={`${branch?.name ?? "Branch"} · ${fmtDate(r.report_date)}`}
        subtitle={`Version ${r.version} by ${by?.name ?? "—"}, submitted ${fmtDateTime(r.submitted_at)}${r.submitted_late ? " (after the deadline)" : ""}${r.is_current ? "" : " · superseded by a later version"}`}
      >
        <Link href={`/dashboard/branch-ops?date=${r.report_date}`} className="text-xs text-brand-600 hover:underline">
          ← Back to Branch Operations
        </Link>
      </PageTitle>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Sales and payments">
          <dl>
            <Row label="Phones" value={`${r.phones_units} units · ${kes(r.phones_value)}`} />
            <Row label="Accessories" value={`${r.accessories_units} units · ${kes(r.accessories_value)}`} />
            <Row label="Repairs and services" value={kes(r.services_value)} />
            <Row label="Total sales" value={<strong>{kes(r.total_sales)}</strong>} />
            <Row label="Top models" value={r.top_models} />
            <Row label="Cash" value={kes(r.pay_cash)} />
            <Row label="M-Pesa" value={kes(r.pay_mpesa)} />
            <Row label="Card" value={kes(r.pay_card)} />
            <Row label="Credit / Lipa Mdogo Mdogo" value={kes(r.pay_credit)} />
            <Row label="Total received" value={kes(r.total_payments)} warn={Math.abs(Number(r.total_payments) - Number(r.total_sales)) > 0.5} />
          </dl>
        </Panel>
        <Panel title="Cash handling">
          <dl>
            <Row label="Opened / closed" value={`${String(r.opened_at ?? "—").slice(0, 5)} / ${String(r.closed_at ?? "—").slice(0, 5)}`} />
            <Row label="Opening float" value={kes(r.opening_float)} />
            <Row label="Cash banked" value={kes(r.cash_banked)} />
            <Row label="Banking reference" value={r.banking_reference} />
            <Row label="Petty cash" value={`${kes(r.petty_cash_total)}${r.petty_cash_notes ? ` — ${r.petty_cash_notes}` : ""}`} />
            <Row label="Closing cash" value={kes(r.closing_cash)} />
            <Row label="Cash variance" value={`${kes(r.cash_variance)}${Number(r.cash_variance) < 0 ? " short" : Number(r.cash_variance) > 0 ? " over" : ""}`} warn={flagged} />
          </dl>
        </Panel>
      </div>

      <Panel title="Attendance on the day">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-1.5 font-medium">Name</th>
              <th className="py-1.5 font-medium">Status</th>
              <th className="py-1.5 font-medium">In / out</th>
              <th className="py-1.5 font-medium">Hours (net)</th>
              <th className="py-1.5 font-medium">Manager&apos;s remark</th>
            </tr>
          </thead>
          <tbody>
            {register.map((p) => (
              <tr key={p.employeeId} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-1.5">{p.name}</td>
                <td className="py-1.5">
                  <Chip tone={p.status === "Present" ? "green" : p.status === "Absent" ? "red" : p.status === "On Leave" ? "blue" : "amber"}>{p.status}</Chip>
                  {p.minutesLate > 0 && <span className="text-xs text-amber-700"> +{p.minutesLate} min</span>}
                </td>
                <td className="py-1.5 tabular-nums">
                  {p.clockIn ?? "—"} / {p.clockOut ?? "—"}
                </td>
                <td className="py-1.5 tabular-nums">{p.hoursWorked ?? "—"}</td>
                <td className="py-1.5 text-neutral-600 dark:text-neutral-300">{remarks[p.employeeId] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Stock">
          <dl>
            <Row label="Received" value={r.stock_received} />
            <Row label="Transferred out" value={r.stock_transferred} />
            <Row label="Returns / warranty" value={r.returns_warranty} />
            <Row label="Low stock" value={r.low_stock} />
          </dl>
        </Panel>
        <Panel title="Customers, incidents and remarks">
          <dl>
            <Row label="Walk-ins" value={r.walk_ins} />
            <Row label="Complaints" value={r.complaints} />
            <Row label="Enquiries not stocked" value={r.enquiries} />
            <Row label="Incident" value={r.incident_type === "none" ? "None" : `${r.incident_type}: ${r.incident_details ?? ""}`} warn={r.incident_type !== "none"} />
            <Row label="Remarks" value={r.remarks} />
          </dl>
        </Panel>
      </div>

      <Panel title="Slips and receipts">
        {(files ?? []).length === 0 ? (
          <p className="text-sm text-neutral-400">No files attached.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(files ?? []).map((f) => {
              const u = urls.get(f.storage_path);
              const isPdf = (f.file_name ?? "").toLowerCase().endsWith(".pdf");
              return (
                <li key={f.id} className="text-xs">
                  <a href={u} target="_blank" rel="noreferrer" className="block">
                    {u && !isPdf ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u} alt={f.file_name ?? f.kind} className="w-full aspect-[3/4] object-cover rounded-lg bg-neutral-100" />
                    ) : (
                      <div className="w-full aspect-[3/4] rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">PDF</div>
                    )}
                  </a>
                  <p className="mt-1">{f.kind === "bank_slip" ? "Bank slip" : f.kind === "receipt" ? "Receipt" : "File"}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {(versions ?? []).length > 1 && (
        <Panel title="Versions" subtitle="Every correction is kept.">
          <ul className="text-sm space-y-1">
            {(versions ?? []).map((v) => (
              <li key={v.id}>
                <Link href={`/dashboard/branch-ops/reports/${v.id}`} className={v.id === r.id ? "font-semibold" : "text-brand-600 hover:underline"}>
                  Version {v.version}
                </Link>{" "}
                · {fmtDateTime(v.submitted_at)} {v.submitted_late && <Chip tone="amber">late</Chip>} {v.is_current && <Chip tone="green">current</Chip>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
