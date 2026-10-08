import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import PositionRequestActions from "../../positions/requests/request-actions";

type NamedUser = { id: string; username?: string | null; employees: { name: string } | null } | null;

function userName(u: unknown): string | null {
  const row = u as NamedUser;
  // Staff with a login but no employee record (e.g. the system administrator) show by username.
  return row?.employees?.name ?? row?.username ?? null;
}

const ACTION_LABEL: Record<string, string> = {
  submit: "Submitted",
  approve: "Approved",
  reject: "Rejected",
  return: "Returned for changes",
  delegate: "Delegated",
  skip: "Skipped",
  cancel: "Cancelled",
};

// Full decision timeline for one approval request (Area 02 spec §19.J) —
// every approval_actions row plus any approval_escalations, in order, so
// anyone who can see the request (requester, an approver past or present,
// or admin/hr) can see exactly what happened and when. Linked from every
// row in the Approvals Centre's history tabs.
export default async function ApprovalRequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: request } = await supabase
    .from("approval_requests")
    .select(
      "id, request_type, summary, status, created_at, decided_at, impact_json, requested_by, requester:requested_by(id, username, employees:employee_id(name)), employees:subject_employee_id(name)"
    )
    .eq("id", requestId)
    .maybeSingle();
  if (!request) notFound();

  const { data: steps } = await supabase
    .from("approval_steps")
    .select(
      "id, step_order, status, approver_user_id, approver_role, decided_at, comment, due_at, started_at, delegated_from, delegated_to, approver:approver_user_id(id, username, employees:employee_id(name)), delegate:delegated_to(id, username, employees:employee_id(name))"
    )
    .eq("approval_request_id", requestId)
    .order("step_order");

  const { data: actions } = await supabase
    .from("approval_actions")
    .select("id, action, reason, created_at, from_status, to_status, actor:actor_user_id(id, username, employees:employee_id(name))")
    .eq("approval_request_id", requestId)
    .order("created_at");

  const { data: escalations } = await supabase
    .from("approval_escalations")
    .select(
      "id, reason, created_at, from:from_approver_id(id, username, employees:employee_id(name)), to:to_approver_id(id, username, employees:employee_id(name))"
    )
    .eq("request_id", requestId)
    .order("created_at");

  // The initiator can edit or delete a position request until someone acts on it.
  let ownPositionRequest: { id: string; request_type: string; payload_json: unknown; justification: string | null } | null = null;
  let units: { id: string; name: string }[] = [];
  let types: { id: string; name: string }[] = [];
  const stepsUntouched = (steps ?? []).every((st) => st.status === "pending");
  if (
    (request.request_type as string).startsWith("position_") &&
    request.requested_by === user.id &&
    request.status === "pending_approval" &&
    stepsUntouched
  ) {
    const { data: pr } = await supabase
      .from("position_requests")
      .select("id, request_type, payload_json, justification, status")
      .eq("approval_request_id", requestId)
      .maybeSingle();
    if (pr && pr.status === "submitted") {
      ownPositionRequest = pr;
      const [{ data: u }, { data: t }] = await Promise.all([
        supabase.from("organisation_units").select("id, name").order("name"),
        supabase.from("position_types").select("id, name").order("name"),
      ]);
      units = u ?? [];
      types = t ?? [];
    }
  }

  type TimelineEntry = { at: string; kind: "action" | "escalation"; node: React.ReactNode };
  const timeline: TimelineEntry[] = [
    ...(actions ?? []).map((a) => ({
      at: a.created_at as string,
      kind: "action" as const,
      node: (
        <>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">{userName(a.actor) ?? "Someone"}</span>{" "}
          {(ACTION_LABEL[a.action as string] ?? a.action).toLowerCase()}
          {a.reason ? <span className="text-neutral-500 dark:text-neutral-400"> — “{a.reason}”</span> : null}
        </>
      ),
    })),
    ...(escalations ?? []).map((e) => ({
      at: e.created_at as string,
      kind: "escalation" as const,
      node: (
        <>
          Escalated from <span className="font-medium text-neutral-900 dark:text-neutral-50">{userName(e.from) ?? "the assigned approver"}</span> to{" "}
          <span className="font-medium text-neutral-900 dark:text-neutral-50">{userName(e.to) ?? "HR/admin"}</span>
          <span className="text-neutral-500 dark:text-neutral-400"> — {e.reason}</span>
        </>
      ),
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/dashboard/approvals" className="text-xs text-brand-600">
          ← Back to Approvals Centre
        </Link>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mt-1">{request.summary}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {(request.request_type as string).replace(/_/g, " ")}
          {request.employees ? ` · ${(request.employees as unknown as { name: string }).name}` : ""} · submitted by{" "}
          {userName(request.requester) ?? "—"} on {new Date(request.created_at as string).toLocaleString("en-KE")}
        </p>
      </div>

      {ownPositionRequest && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Your request</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">You can change or delete this until an approver acts on it.</p>
          <PositionRequestActions
            id={ownPositionRequest.id}
            requestType={ownPositionRequest.request_type}
            payload={(ownPositionRequest.payload_json ?? {}) as Record<string, unknown>}
            justification={ownPositionRequest.justification ?? ""}
            units={units}
            types={types}
          />
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Steps</h2>
        {(steps ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 text-sm border-b border-neutral-50 dark:border-neutral-900 last:border-0 pb-2 last:pb-0">
            <div>
              <p className="text-neutral-900 dark:text-neutral-50">
                Step {s.step_order}: {userName(s.approver) ?? (s.approver_role ? `Anyone with role "${s.approver_role}"` : "—")}
                {s.delegated_to ? ` (decided by ${userName(s.delegate) ?? "a delegate"})` : ""}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {s.due_at ? `Due ${new Date(s.due_at).toLocaleString("en-KE")}` : "No SLA set"}
                {s.decided_at ? ` · decided ${new Date(s.decided_at).toLocaleString("en-KE")}` : ""}
                {s.comment ? ` · “${s.comment}”` : ""}
              </p>
            </div>
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 capitalize">{s.status}</span>
          </div>
        ))}
        {(!steps || steps.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">No human steps — this request was auto-approved.</p>}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Timeline</h2>
        {timeline.length === 0 && <p className="text-sm text-neutral-400 dark:text-neutral-500">No activity recorded yet.</p>}
        <ol className="space-y-2">
          {timeline.map((t, i) => (
            <li key={i} className="text-sm flex items-baseline gap-2">
              <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0 w-36">{new Date(t.at).toLocaleString("en-KE")}</span>
              <span>{t.node}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
