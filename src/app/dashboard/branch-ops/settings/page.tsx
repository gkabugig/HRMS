import ActionForm from "@/components/forms/action-form";
import { pageCtx, type Db } from "@/lib/hub/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/branch-ops/alerts";
import { revokeKiosk, saveBranchRunners, saveOpsSettings, setStaffPin } from "@/lib/branch-ops/admin-actions";
import { isWhatsAppConfigured } from "@/lib/notifications/channels/whatsapp";
import { BTN, BTN_DANGER, Chip, Empty, INPUT, LABEL, PageTitle, Panel, fmtDateTime } from "@/components/ui/page-kit";
import OpsNav, { NotAllowed } from "../ops-nav";
import { CreateKioskForm, RepairButton } from "./pairing-forms";

export default async function BranchOpsSettingsPage() {
  const c = await pageCtx();
  if (!["admin", "hr"].includes(c.role)) return <NotAllowed />;
  const db = createAdminClient() as Db;

  const [settings, { data: branches }, { data: employees }, { data: kiosks }, { data: pins }] = await Promise.all([
    loadSettings(db, c.orgId),
    db.from("branches").select("id, name, manager_employee_id, deputy_employee_id, opening_time, closing_time").eq("org_id", c.orgId).order("name"),
    db.from("employees").select("id, name, branch_id, job_title").eq("org_id", c.orgId).eq("status", "Active").order("name"),
    db.from("branch_kiosks").select("id, branch_id, name, token_hash, paired_at, last_seen_at, revoked_at, pairing_expires_at").eq("org_id", c.orgId).order("created_at"),
    db.from("employee_kiosk_pins").select("employee_id, set_at, locked_until").eq("org_id", c.orgId),
  ]);
  const branchName = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));
  const pinBy = new Map((pins ?? []).map((p) => [p.employee_id as string, p]));
  const branchStaff = (employees ?? []).filter((e) => e.branch_id);
  const withoutPin = branchStaff.filter((e) => !pinBy.has(e.id)).length;
  const waOn = isWhatsAppConfigured();

  return (
    <div className="space-y-6">
      <PageTitle title="Branch Operations settings">
        <OpsNav current="/dashboard/branch-ops/settings" />
      </PageTitle>

      <Panel title="Reports and alerts">
        <ActionForm action={saveOpsSettings} successMessage="Settings saved." resetOnSuccess={false} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <label>
            <span className={LABEL}>Daily report deadline</span>
            <input name="report_deadline" type="time" defaultValue={settings.report_deadline} className={INPUT} />
          </label>
          <label>
            <span className={LABEL}>Alert when cash is short or over by more than (KES)</span>
            <input name="cash_variance_threshold" inputMode="decimal" defaultValue={String(settings.cash_variance_threshold)} className={INPUT} />
          </label>
          <label>
            <span className={LABEL}>Keep clock-in photos for (days)</span>
            <input name="photo_retention_days" inputMode="numeric" defaultValue={String(settings.photo_retention_days)} className={INPUT} />
          </label>
          <label className="sm:col-span-2">
            <span className={LABEL}>Owners&apos; WhatsApp numbers (comma separated)</span>
            <input name="owner_whatsapp_numbers" defaultValue={settings.owner_whatsapp_numbers.map((n) => `+${n}`).join(", ")} placeholder="0712 345 678, 0722 000 111" className={INPUT} />
          </label>
          <button className={BTN}>Save</button>
          <p className="sm:col-span-3 text-xs text-neutral-500 dark:text-neutral-400">
            WhatsApp sending is {waOn ? <Chip tone="green">connected</Chip> : <Chip tone="amber">not connected yet</Chip>}. Alerts run at 8:20 am (late, absent, branch not open), 10:00 pm (report reminder to managers) and 11:00 pm (owners&apos; summary); cash and incident alerts go out as soon as a report is submitted. Every alert also appears in the administrators&apos; notifications.
          </p>
        </ActionForm>
      </Panel>

      <Panel title="Who runs each branch" subtitle="The manager and deputy can submit the branch's daily report and request missed-clock corrections for its staff.">
        {(branches ?? []).length === 0 ? (
          <Empty>Add branches first under Branches.</Empty>
        ) : (
          <div className="space-y-3">
            {(branches ?? []).map((b) => (
              <ActionForm key={b.id} action={saveBranchRunners} successMessage="Saved." resetOnSuccess={false} className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end border-t border-neutral-100 dark:border-neutral-800 pt-3 first:border-t-0 first:pt-0">
                <input type="hidden" name="branch_id" value={b.id} />
                <p className="col-span-2 sm:col-span-1 text-sm font-medium self-center">{b.name}</p>
                <label>
                  <span className={LABEL}>Manager</span>
                  <select name="manager_employee_id" defaultValue={b.manager_employee_id ?? ""} className={INPUT}>
                    <option value="">None</option>
                    {(employees ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.branch_id && e.branch_id !== b.id ? ` (${branchName.get(e.branch_id)})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={LABEL}>Deputy</span>
                  <select name="deputy_employee_id" defaultValue={b.deputy_employee_id ?? ""} className={INPUT}>
                    <option value="">None</option>
                    {(employees ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={LABEL}>Opens</span>
                  <input type="time" name="opening_time" defaultValue={String(b.opening_time ?? "").slice(0, 5)} className={INPUT} />
                </label>
                <label>
                  <span className={LABEL}>Closes</span>
                  <input type="time" name="closing_time" defaultValue={String(b.closing_time ?? "").slice(0, 5)} className={INPUT} />
                </label>
                <button className={BTN}>Save</button>
              </ActionForm>
            ))}
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Lateness is measured against each person&apos;s shift under Shifts (for Cesscom: 08:00–22:00, 15 minutes&apos; grace). Staff with no shift use 08:00 with 15 minutes&apos; grace. A deputy with the Employee role also needs &quot;Branch Daily Report&quot; switched on for their role in Settings.
            </p>
          </div>
        )}
      </Panel>

      <Panel title="Clocking kiosks" subtitle="One tablet or phone per branch, left at the counter with the kiosk page open.">
        <div className="space-y-4">
          {(kiosks ?? []).length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="py-1.5 font-medium">Branch</th>
                  <th className="py-1.5 font-medium">Device</th>
                  <th className="py-1.5 font-medium">Status</th>
                  <th className="py-1.5 font-medium">Last used</th>
                  <th className="py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(kiosks ?? []).map((k) => {
                  const status = k.revoked_at ? <Chip tone="red">Switched off</Chip> : k.token_hash ? <Chip tone="green">Paired</Chip> : <Chip tone="amber">Waiting to pair</Chip>;
                  return (
                    <tr key={k.id} className="border-t border-neutral-100 dark:border-neutral-800 align-top">
                      <td className="py-2">{branchName.get(k.branch_id)}</td>
                      <td className="py-2">{k.name}</td>
                      <td className="py-2">{status}</td>
                      <td className="py-2">{fmtDateTime(k.last_seen_at)}</td>
                      <td className="py-2 space-y-2">
                        <RepairButton kioskId={k.id} />
                        {!k.revoked_at && (
                          <ActionForm action={revokeKiosk.bind(null, k.id)} successMessage="Switched off.">
                            <button className={BTN_DANGER}>Switch off</button>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {(branches ?? []).length > 0 && <CreateKioskForm branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))} />}
          <details className="text-xs text-neutral-600 dark:text-neutral-300">
            <summary className="cursor-pointer font-medium">Setting up a branch tablet</summary>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Use an Android tablet or phone with a front camera, on the branch Wi-Fi or a data bundle, plugged in at the counter.</li>
              <li>Open Chrome, go to this site&apos;s /kiosk page, type the pairing code, and allow camera access when asked.</li>
              <li>Add the page to the home screen, then turn on Android screen pinning (Settings → Security → App pinning) so staff can&apos;t leave the kiosk.</li>
              <li>If the tablet is lost, press Switch off here. It stops working immediately.</li>
            </ol>
          </details>
        </div>
      </Panel>

      <Panel title="Staff PINs" subtitle={`Each person clocks in with their own 4-digit PIN. ${withoutPin} branch staff ${withoutPin === 1 ? "has" : "have"} no PIN yet.`}>
        {branchStaff.length === 0 ? (
          <Empty>Assign staff to branches on the Employees page first.</Empty>
        ) : (
          <div className="space-y-4">
            <ActionForm action={setStaffPin} successMessage="PIN set. Tell the staff member in person." className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <label>
                <span className={LABEL}>Staff member</span>
                <select name="employee_id" required className={INPUT}>
                  <option value="">Choose…</option>
                  {branchStaff.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {branchName.get(e.branch_id)}
                      {pinBy.has(e.id) ? " (reset)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={LABEL}>New 4-digit PIN</span>
                <input name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" required className={INPUT} />
              </label>
              <button className={BTN}>Set PIN</button>
            </ActionForm>
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="py-1.5 font-medium">Name</th>
                  <th className="py-1.5 font-medium">Branch</th>
                  <th className="py-1.5 font-medium">PIN</th>
                </tr>
              </thead>
              <tbody>
                {branchStaff.map((e) => {
                  const p = pinBy.get(e.id);
                  const locked = p?.locked_until && new Date(p.locked_until) > new Date();
                  return (
                    <tr key={e.id} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="py-1.5">{e.name}</td>
                      <td className="py-1.5">{branchName.get(e.branch_id)}</td>
                      <td className="py-1.5">{locked ? <Chip tone="red">Locked after wrong PINs</Chip> : p ? <Chip tone="green">Set {fmtDateTime(p.set_at)}</Chip> : <Chip tone="amber">Not set</Chip>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
