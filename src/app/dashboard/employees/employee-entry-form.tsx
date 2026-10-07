"use client";

// "Add employee" form that can also load an existing employee: type a staff
// number (or national ID), press Look up, and the form fills in their details
// and switches to "Save changes" so they can be edited right here.
import { useState, useTransition } from "react";
import ActionForm from "@/components/forms/action-form";
import { createEmployee, updateEmployee, lookupEmployee } from "./actions";

type Option = { id: string; name: string };
type Rec = Record<string, string | number | null>;

const base =
  "border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2";

export default function EmployeeEntryForm({ employees, branches }: { employees: Option[]; branches: Option[] }) {
  const [staffNo, setStaffNo] = useState("");
  const [record, setRecord] = useState<(Rec & { id: string; name: string }) | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [pending, start] = useTransition();

  const v = (k: string) => (record && record[k] != null ? String(record[k]) : "");
  const editing = record !== null;

  function lookup() {
    setMessage(null);
    start(async () => {
      const res = await lookupEmployee(staffNo);
      if (res.error || !res.employee) {
        setRecord(null);
        setMessage(res.error ?? "Not found.");
        return;
      }
      setRecord(res.employee);
      setStaffNo(String(res.employee.staff_no ?? staffNo));
      setFormKey((k) => k + 1);
    });
  }

  function reset() {
    setRecord(null);
    setStaffNo("");
    setMessage(null);
    setFormKey((k) => k + 1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
        <input
          value={staffNo}
          onChange={(e) => setStaffNo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lookup();
            }
          }}
          placeholder="Staff no. or national ID"
          className={`${base} w-56`}
          aria-label="Staff number or national ID to look up"
        />
        <button type="button" onClick={lookup} disabled={pending} className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50">
          {pending ? "Looking up…" : "Look up"}
        </button>
        {editing && (
          <button type="button" onClick={reset} className="text-xs text-brand-600 hover:underline">
            Clear and add a new employee
          </button>
        )}
        {message && <span role="alert" className="text-xs text-red-600">{message}</span>}
      </div>

      {editing && (
        <p className="mb-3 text-xs rounded-lg bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-200 px-3 py-2">
          Editing existing employee <strong>{record.name}</strong> ({v("staff_no")}). Change anything below and press <strong>Save changes</strong>.
        </p>
      )}

      <ActionForm
        key={`${record?.id ?? "new"}-${formKey}`}
        action={editing ? updateEmployee.bind(null, record.id) : createEmployee}
        successMessage={editing ? "Employee updated." : "Employee added."}
        resetOnSuccess={!editing}
        onSuccess={() => {
          if (!editing) {
            setStaffNo("");
          }
        }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm"
      >
        <input type="hidden" name="staff_no" value={staffNo} />
        <p className="sm:col-span-3 text-xs text-neutral-500 dark:text-neutral-400">Staff No: <strong>{staffNo || "type it in the box above"}</strong></p>
        <input name="name" defaultValue={v("name")} placeholder="Full name" required readOnly={editing} title={editing ? "Name changes are made through the employee's profile" : undefined} className={`${base} ${editing ? "bg-neutral-50 dark:bg-neutral-900" : ""}`} />
        <input name="department" defaultValue={v("department")} placeholder="Department" required className={base} />
        <input name="job_title" defaultValue={v("job_title")} placeholder="Job title" required className={base} />
        <select name="employment_type" defaultValue={v("employment_type") || "Permanent"} className={base}>
          <option>Permanent</option>
          <option>Contract</option>
          <option>Casual</option>
          <option>Intern</option>
        </select>
        <input name="date_of_hire" type="date" defaultValue={v("date_of_hire")} required className={base} />
        <select name="reporting_manager_id" defaultValue={v("reporting_manager_id")} className={base}>
          <option value="">Reports to (optional)</option>
          {employees.filter((m) => m.id !== record?.id).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select name="branch_id" defaultValue={v("branch_id")} className={base}>
          <option value="">Branch (optional)</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label className="text-xs text-neutral-500 dark:text-neutral-400 flex flex-col gap-1">
          Probation ends (defaults to hire date + 6 months)
          <input name="probation_end_date" type="date" defaultValue={v("probation_end_date")} className={base} />
        </label>
        <label className="text-xs text-neutral-500 dark:text-neutral-400 flex flex-col gap-1">
          Written contract issued on
          <input name="contract_issued_on" type="date" defaultValue={v("contract_issued_on")} className={base} />
        </label>
        <input name="basic" type="number" step="0.01" defaultValue={v("basic")} placeholder="Basic salary" className={base} />
        <input name="house_allowance" type="number" step="0.01" defaultValue={v("house_allowance")} placeholder="House allowance" className={base} />
        <input name="transport_allowance" type="number" step="0.01" defaultValue={v("transport_allowance")} placeholder="Transport allowance" className={base} />
        <input name="other_allowance" type="number" step="0.01" defaultValue={v("other_allowance")} placeholder="Other allowance" className={base} />
        <input name="kra_pin" defaultValue={v("kra_pin")} placeholder="KRA PIN" className={base} />
        <input name="nssf_no" defaultValue={v("nssf_no")} placeholder="NSSF No" className={base} />
        <input name="shif_no" defaultValue={v("shif_no")} placeholder="SHIF No" className={base} />
        <p className="text-xs text-neutral-500 dark:text-neutral-400 sm:col-span-3 pt-1 border-t border-neutral-100 dark:border-neutral-800">
          Personal &amp; contact details (optional)
        </p>
        <input name="date_of_birth" type="date" defaultValue={v("date_of_birth")} className={base} />
        <select name="gender" defaultValue={v("gender")} className={base}>
          <option value="">Gender (optional)</option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
          <option value="Other">Other</option>
        </select>
        <select name="marital_status" defaultValue={v("marital_status")} className={base}>
          <option value="">Marital status (optional)</option>
          <option value="Single">Single</option>
          <option value="Married">Married</option>
          <option value="Divorced">Divorced</option>
          <option value="Widowed">Widowed</option>
        </select>
        <input name="nationality" defaultValue={v("nationality")} placeholder="Nationality" className={base} />
        <input name="national_id" defaultValue={v("national_id")} placeholder="National ID" className={base} />
        <input name="passport_no" defaultValue={v("passport_no")} placeholder="Passport no." className={base} />
        <input name="phone_number" defaultValue={v("phone_number")} placeholder="Phone number" className={base} />
        <input name="personal_email" type="email" defaultValue={v("personal_email")} placeholder="Personal email" className={base} />
        <input name="physical_address" defaultValue={v("physical_address")} placeholder="Physical address" className={base} />
        <input name="postal_address" defaultValue={v("postal_address")} placeholder="Postal address" className={base} />
        <button type="submit" className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
          {editing ? "Save changes" : "Add employee"}
        </button>
      </ActionForm>
    </div>
  );
}
