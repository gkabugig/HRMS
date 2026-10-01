import { createClient } from "@/lib/supabase/server";
import ApprovalInboxRow from "./approval-inbox-row";
import ApprovalRequestRow from "./approval-request-row";
import ApprovalTabsNav, { type ApprovalTab } from "./approval-tabs";
import MyDelegations from "./my-delegations";

type RequestJoin = {
  id: string;
  request_type: string;
  summary: string;
  created_at: string;
  decided_at: string | null;
  status: string;
  requested_by: string;
  employees: { name: string } | null;
};

function unwrapRequest(raw: unknown): RequestJoin | null {
  const req = raw as RequestJoin | RequestJoin[] | null;
  if (!req) return null;
  return Array.isArray(req) ? (req[0] ?? null) : req;
}

const REQUEST_SELECT =
  "id, request_type, summary, created_at, decided_at, status, requested_by, employees:subject_employee_id(name)";

// Approvals Centre (Phase 2 spec §10.4 + Area 02 spec §19.J "Approvals
// Centre should surface pending, delegated, overdue, and completed work in
// one place"). Tabs are server-rendered per ?tab= — no client-side
// re-fetching, so each tab is just a different query against the same
// approval_requests/approval_steps tables everything else in the engine
// already writes to.
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser) return null;
  const isAdminOrHr = ["admin", "hr"].includes(appUser.role);

  const validTabs: ApprovalTab[] = ["pending", "delegated", "submitted", "overdue", "completed", "all"];
  const tab: ApprovalTab = validTabs.includes(rawTab as ApprovalTab) ? (rawTab as ApprovalTab) : "pending";
  const effectiveTab = tab === "all" && !isAdminOrHr ? "pending" : tab;

  // Active delegations to me right now — drives both the "Delegated to Me"
  // tab and which pending steps assigned to someone else I can still act on.
  const { data: activeDelegationsToMe } = await supabase
    .from("approval_delegations")
    .select("delegator_user_id, resource")
    .eq("delegate_user_id", user.id)
    .lte("starts_at", new Date().toISOString())
    .gte("ends_at", new Date().toISOString());
  const delegatorIds = [...new Set((activeDelegationsToMe ?? []).map((d) => d.delegator_user_id as string))];

  let actionableSteps: {
    id: string;
    approver_user_id: string | null;
    approver_role: string | null;
    due_at: string | null;
    approval_requests: unknown;
  }[] = [];
  let historyRequests: RequestJoin[] = [];

  if (effectiveTab === "pending" || effectiveTab === "delegated" || effectiveTab === "overdue") {
    const { data: steps } = await supabase
      .from("approval_steps")
      .select(`id, approver_user_id, approver_role, due_at, approval_requests(${REQUEST_SELECT})`)
      .eq("status", "pending")
      .order("id");

    const named = (steps ?? []).filter((s) => s.approver_user_id === user.id);
    const byRole = (steps ?? []).filter((s) => s.approver_role === appUser.role);
    const delegatedPending = (steps ?? []).filter((s) => {
      if (!s.approver_user_id || !delegatorIds.includes(s.approver_user_id)) return false;
      const delegation = (activeDelegationsToMe ?? []).find((d) => d.delegator_user_id === s.approver_user_id);
      const req = unwrapRequest(s.approval_requests);
      return delegation && (!delegation.resource || delegation.resource === req?.request_type);
    });

    if (effectiveTab === "pending") {
      actionableSteps = [...named, ...byRole];
    } else if (effectiveTab === "delegated") {
      actionableSteps = delegatedPending;
    } else {
      // overdue — admin/hr see every overdue step org-wide; everyone else
      // sees just their own (named/role/delegated) overdue steps.
      const mine = [...named, ...byRole, ...delegatedPending];
      const overdueOf = (list: typeof mine) => list.filter((s) => s.due_at && new Date(s.due_at).getTime() < new Date().getTime());
      actionableSteps = isAdminOrHr ? overdueOf(steps ?? []) : overdueOf(mine);
    }
  } else if (effectiveTab === "submitted") {
    const { data } = await supabase
      .from("approval_requests")
      .select(REQUEST_SELECT)
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    historyRequests = (data ?? []) as unknown as RequestJoin[];
  } else if (effectiveTab === "completed") {
    if (isAdminOrHr) {
      const { data } = await supabase
        .from("approval_requests")
        .select(REQUEST_SELECT)
        .eq("org_id", appUser.org_id)
        .in("status", ["approved", "rejected", "returned", "cancelled"])
        .order("decided_at", { ascending: false })
        .limit(50);
      historyRequests = (data ?? []) as unknown as RequestJoin[];
    } else {
      const { data: actedOn } = await supabase.from("approval_actions").select("approval_request_id").eq("actor_user_id", user.id);
      const requestIds = [...new Set((actedOn ?? []).map((a) => a.approval_request_id as string))];
      const { data } = await supabase
        .from("approval_requests")
        .select(REQUEST_SELECT)
        .in("status", ["approved", "rejected", "returned", "cancelled"])
        .or(`requested_by.eq.${user.id}${requestIds.length ? `,id.in.(${requestIds.join(",")})` : ""}`)
        .order("decided_at", { ascending: false })
        .limit(50);
      historyRequests = (data ?? []) as unknown as RequestJoin[];
    }
  } else if (effectiveTab === "all" && isAdminOrHr) {
    const { data } = await supabase
      .from("approval_requests")
      .select(REQUEST_SELECT)
      .eq("org_id", appUser.org_id)
      .order("created_at", { ascending: false })
      .limit(100);
    historyRequests = (data ?? []) as unknown as RequestJoin[];
  }

  // "My Delegations" data — colleagues to delegate to, this user's own
  // delegations (as delegator), delegations someone handed to this user,
  // and the org's active approval resources for the scope dropdown.
  const [{ data: colleagueRows }, { data: myDelegationRows }, { data: delegatedToMeRows }, { data: definitions }] = await Promise.all([
    supabase.from("app_users").select("id, employees:employee_id(name)").eq("org_id", appUser.org_id).neq("id", user.id),
    supabase
      .from("approval_delegations")
      .select("id, delegate_user_id, delegator_user_id, starts_at, ends_at, resource, reason")
      .eq("delegator_user_id", user.id)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
    supabase
      .from("approval_delegations")
      .select(
        "id, delegate_user_id, delegator_user_id, starts_at, ends_at, resource, reason, delegator:delegator_user_id(employees:employee_id(name))"
      )
      .eq("delegate_user_id", user.id)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
    supabase.from("approval_definitions").select("resource, name").eq("org_id", appUser.org_id).eq("is_active", true),
  ]);

  const colleagues = (colleagueRows ?? []).map((u) => ({
    id: u.id as string,
    name: (u.employees as unknown as { name: string } | null)?.name ?? "Unnamed user",
  }));
  const nowMs = new Date().getTime();
  const myDelegations = (myDelegationRows ?? []).map((d) => ({
    id: d.id as string,
    delegate_user_id: d.delegate_user_id as string,
    delegator_user_id: d.delegator_user_id as string,
    starts_at: d.starts_at as string,
    ends_at: d.ends_at as string,
    resource: d.resource as string | null,
    reason: d.reason as string | null,
    isActive: new Date(d.starts_at as string).getTime() <= nowMs && new Date(d.ends_at as string).getTime() >= nowMs,
  }));
  const delegatedToMe = (delegatedToMeRows ?? []).map((d) => ({
    id: d.id as string,
    delegate_user_id: d.delegate_user_id as string,
    delegator_user_id: d.delegator_user_id as string,
    starts_at: d.starts_at as string,
    ends_at: d.ends_at as string,
    resource: d.resource as string | null,
    reason: d.reason as string | null,
    delegatorName: (d.delegator as unknown as { employees: { name: string } | null } | null)?.employees?.name ?? "A colleague",
  }));
  const resourceOptions = Array.from(new Map((definitions ?? []).map((d) => [d.resource as string, d.name as string])).entries()).map(
    ([value, label]) => ({ value, label })
  );

  const emptyCopy: Record<ApprovalTab, string> = {
    pending: "Nothing waiting on you.",
    delegated: "Nothing delegated to you right now.",
    submitted: "You haven't submitted any requests.",
    overdue: "Nothing overdue.",
    completed: "No recently completed requests.",
    all: "No requests yet.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Approvals Centre</h1>
        <p className="text-sm text-neutral-500">
          Requests across every module that uses the shared approval engine — pending decisions, delegations, and history.
        </p>
      </div>

      <ApprovalTabsNav active={effectiveTab} isAdminOrHr={isAdminOrHr} />

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] divide-y divide-neutral-100">
        {(effectiveTab === "pending" || effectiveTab === "delegated" || effectiveTab === "overdue") && (
          <>
            {actionableSteps.length === 0 && <p className="px-5 py-6 text-sm text-neutral-400 text-center">{emptyCopy[effectiveTab]}</p>}
            {actionableSteps.map((s) => {
              const req = unwrapRequest(s.approval_requests);
              if (!req) return null;
              return (
                <ApprovalInboxRow
                  key={s.id}
                  stepId={s.id}
                  requestType={req.request_type}
                  summary={req.summary}
                  employeeName={req.employees?.name ?? null}
                  createdAt={req.created_at}
                  dueAt={s.due_at}
                  isOverdue={Boolean(s.due_at) && new Date(s.due_at as string).getTime() < new Date().getTime()}
                  canEscalate={isAdminOrHr}
                />
              );
            })}
          </>
        )}

        {(effectiveTab === "submitted" || effectiveTab === "completed" || effectiveTab === "all") && (
          <>
            {historyRequests.length === 0 && <p className="px-5 py-6 text-sm text-neutral-400 text-center">{emptyCopy[effectiveTab]}</p>}
            {historyRequests.map((req) => (
              <ApprovalRequestRow
                key={req.id}
                requestId={req.id}
                requestType={req.request_type}
                summary={req.summary}
                employeeName={req.employees?.name ?? null}
                createdAt={req.created_at}
                decidedAt={req.decided_at}
                status={req.status}
              />
            ))}
          </>
        )}
      </div>

      <MyDelegations
        colleagues={colleagues}
        myDelegations={myDelegations}
        delegatedToMe={delegatedToMe}
        resourceOptions={resourceOptions}
      />
    </div>
  );
}
