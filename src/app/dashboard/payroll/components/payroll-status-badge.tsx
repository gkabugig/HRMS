import { STATUS_LABELS, type PayrollStatus } from "@/lib/payroll/state-machine";

const COLORS: Record<PayrollStatus, string> = {
  draft: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300",
  inputs_open: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300",
  calculated: "bg-brand-50 text-brand-700",
  under_review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  processed: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-100 text-emerald-800",
  closed: "bg-neutral-800 text-white",
};

export default function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
