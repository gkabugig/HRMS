import Link from "next/link";

const STATUS_STYLES: Record<string, string> = {
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  returned: "bg-orange-50 text-orange-700 border-orange-200",
  cancelled: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
};

// Read-only summary row for the history/overview tabs (Submitted by Me,
// Overdue, Recently Completed, All Requests) — these aren't actionable from
// the list, so unlike ApprovalInboxRow there's no Approve/Reject here; each
// row links through to the full decision timeline instead.
export default function ApprovalRequestRow({
  requestId,
  requestType,
  summary,
  employeeName,
  createdAt,
  decidedAt,
  status,
}: {
  requestId: string;
  requestType: string;
  summary: string;
  employeeName: string | null;
  createdAt: string;
  decidedAt?: string | null;
  status: string;
}) {
  return (
    <Link
      href={`/dashboard/approvals/${requestId}`}
      className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap hover:bg-neutral-50 hover:dark:bg-neutral-900"
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-wide text-brand-600 font-medium">{requestType.replace(/_/g, " ")}</p>
          <span className={`text-[10px] uppercase tracking-wide font-semibold border rounded px-1.5 py-0.5 ${STATUS_STYLES[status] ?? "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"}`}>
            {status.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-sm text-neutral-900 dark:text-neutral-50">{summary}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {employeeName ? `${employeeName} · ` : ""}
          {new Date(createdAt).toLocaleString("en-KE")}
          {decidedAt ? ` · decided ${new Date(decidedAt).toLocaleString("en-KE")}` : ""}
        </p>
      </div>
      <span className="text-xs text-brand-600">View →</span>
    </Link>
  );
}
