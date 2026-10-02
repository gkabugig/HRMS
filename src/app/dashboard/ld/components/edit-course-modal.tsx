"use client";

// A plain <details>/<summary> dropdown doesn't work here because the
// catalog table's wrapper uses overflow-hidden (for its rounded corners),
// which clips the absolutely-positioned panel the moment it opens - the
// toggle "works" but nothing visible happens. A fixed-position modal (same
// pattern as LeaveRequestDialog) sits above everything instead.
import { useState, useTransition } from "react";
import { updateCourse } from "../actions";

type Course = {
  id: string;
  name: string;
  provider: string | null;
  mode: string | null;
  duration: string | null;
  cost: number | null;
  mandatory: boolean;
  validity_months: number | null;
};

export default function EditCourseModal({ course }: { course: Course }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmitting] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startSubmitting(async () => {
      try {
        await updateCourse(course.id, formData);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save changes.");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
        Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-neutral-900/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Edit course</h2>
            </div>
            <form action={onSubmit} className="px-5 py-4 space-y-3 text-sm text-left">
              <label className="block">
                <span className="text-neutral-600 dark:text-neutral-300 text-xs">Course name</span>
                <input
                  name="name"
                  defaultValue={course.name}
                  required
                  placeholder="Course name"
                  className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-neutral-600 dark:text-neutral-300 text-xs">Provider</span>
                <input
                  name="provider"
                  defaultValue={course.provider ?? ""}
                  placeholder="Provider"
                  className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-neutral-600 dark:text-neutral-300 text-xs">Mode</span>
                  <select
                    name="mode"
                    defaultValue={course.mode ?? ""}
                    className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                  >
                    <option value="">Mode</option>
                    <option>In-person</option>
                    <option>Online</option>
                    <option>Blended</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-neutral-600 dark:text-neutral-300 text-xs">Duration</span>
                  <input
                    name="duration"
                    defaultValue={course.duration ?? ""}
                    placeholder="e.g. 2 days"
                    className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-neutral-600 dark:text-neutral-300 text-xs">Cost (KES)</span>
                  <input
                    name="cost"
                    type="number"
                    step="0.01"
                    defaultValue={course.cost ?? 0}
                    className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="text-neutral-600 dark:text-neutral-300 text-xs">Validity (months)</span>
                  <input
                    name="validity_months"
                    type="number"
                    defaultValue={course.validity_months ?? ""}
                    placeholder="Optional"
                    className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                <input type="checkbox" name="mandatory" defaultChecked={course.mandatory} /> Mandatory course
              </label>

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 dark:text-neutral-400 px-3 py-2">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-4 py-2 font-medium disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
