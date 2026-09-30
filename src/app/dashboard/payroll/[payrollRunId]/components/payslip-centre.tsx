import { publishPayslips } from "../actions";

export default function PayslipCentre({
  runId,
  employeeCount,
  publishedCount,
  status,
  canManage,
}: {
  runId: string;
  employeeCount: number;
  publishedCount: number;
  status: string;
  canManage: boolean;
}) {
  const eligible = ["approved", "processed", "paid", "closed"].includes(status);
  const allPublished = employeeCount > 0 && publishedCount === employeeCount;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">Payslip Centre</h2>
      <p className="text-sm text-neutral-600">
        {publishedCount} of {employeeCount} payslips published to employee self-service.
      </p>
      {canManage && !allPublished && (
        <form action={publishPayslips} className="mt-3">
          <input type="hidden" name="run_id" value={runId} />
          <button
            type="submit"
            disabled={!eligible}
            className="bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors py-2 px-4 text-sm font-medium"
          >
            Publish all payslips
          </button>
          {!eligible && <p className="text-xs text-neutral-400 mt-1.5">Payslips can be published once payroll is approved.</p>}
        </form>
      )}
    </div>
  );
}
