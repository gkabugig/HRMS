// Area 12: typed tool handlers (spec §9.4 read tools, §9.5 action tools).
//
// Every handler is called with the CALLER'S OWN session-scoped Supabase
// client (src/lib/ai/types.ts ToolCallContext) — never a service-role
// client — so Postgres RLS is the real backstop on every query here, not
// just a convention. Read tools execute immediately and return data.
// Action tools never execute a domain effect from this file directly: the
// gateway (gateway.ts) always stages an action tool call as a row in
// ai_action_requests with status 'pending' and returns a "needs your
// confirmation" result to the model. Only confirm-action.ts, invoked from
// an explicit user confirmation (never from model output alone), calls the
// ACTION_EXECUTORS map below to actually run the existing domain service
// (the same server action the ordinary UI for that feature calls), on the
// *original requester's* session client, so that service's own
// authorization/RBAC checks run again at execution time too — this is what
// satisfies "re-authorize every tool call server-side" (spec §9.8) for a
// two-step propose-then-confirm action rather than a single call.

import type { ToolCallContext, ToolHandler, ToolResult } from "./types";

function ok(data: unknown): ToolResult {
  return { ok: true, data };
}
function fail(error: string): ToolResult {
  return { ok: false, error };
}

// ---------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------

const getEmployeeProfile: ToolHandler = async (ctx, args) => {
  const employeeId = (args.employee_id as string | undefined) ?? ctx.employeeId ?? null;
  if (!employeeId) return fail("No employee specified and the caller has no linked employee record.");
  const { data, error } = await ctx.supabase
    .from("employees")
    .select("id, staff_no, name, department, job_title, employment_type, date_of_hire, status, reporting_manager_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Employee not found, or not visible to you.");
  return ok(data);
};

const getWorkforceKpis: ToolHandler = async (ctx, args) => {
  if (!["admin", "hr"].includes(ctx.role)) return fail("Workforce KPIs are visible to HR and admin roles only.");
  const { computeWorkforceMetrics } = await import("@/lib/intelligence/metrics/compute-metrics");
  const metrics = await computeWorkforceMetrics(ctx.supabase, ctx.orgId);
  const dashboard = String(args.dashboard || "executive");
  // Return the whole metrics object but flag which dashboard view was asked
  // for; the assistant narrows its answer in the response, not here.
  return ok({ dashboard, metrics });
};

const getWorkforceRisks: ToolHandler = async (ctx, args) => {
  if (!["admin", "hr"].includes(ctx.role)) return fail("Workforce risks are visible to HR and admin roles only.");
  let query = ctx.supabase
    .from("workforce_risks")
    .select("id, rule_code, title, description, category, status, severity, risk_score, entity_type, entity_id, first_detected_at, last_detected_at")
    .order("risk_score", { ascending: false })
    .limit(25);
  if (args.rule_code) query = query.eq("rule_code", String(args.rule_code));
  if (args.severity) query = query.eq("severity", String(args.severity));
  if (args.status) query = query.eq("status", String(args.status));
  else query = query.not("status", "in", "(closed,dismissed)");
  const { data, error } = await query;
  if (error) return fail(error.message);
  return ok(data);
};

const searchHrPolicy: ToolHandler = async (ctx, args) => {
  const query = String(args.query || "").trim();
  if (query.length < 2) return fail("Provide a search query of at least 2 characters.");
  const { searchKnowledge } = await import("./rag");
  const results = await searchKnowledge(ctx.supabase, ctx.orgId, query);
  if (results.length === 0) return ok({ results: [], note: "No indexed policy passages matched this query." });
  return ok({ results });
};

const getApprovalStatus: ToolHandler = async (ctx, args) => {
  const id = String(args.approval_request_id || "");
  if (!id) return fail("approval_request_id is required.");
  const { data, error } = await ctx.supabase
    .from("approval_requests")
    .select("id, request_type, status, current_step, summary, created_at, decided_at, approval_steps(id, step_order, approver_role, status, decided_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Approval request not found, or not visible to you.");
  return ok(data);
};

const getCaseStatus: ToolHandler = async (ctx, args) => {
  const id = String(args.case_id || "");
  if (!id) return fail("case_id is required.");
  const { data, error } = await ctx.supabase
    .from("service_requests")
    .select("id, subject, status, priority, sla_due_at, resolved_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Case not found, or not visible to you.");
  return ok(data);
};

const getDocumentStatus: ToolHandler = async (ctx, args) => {
  const id = String(args.document_id || "");
  if (!id) return fail("document_id is required.");
  const { data, error } = await ctx.supabase
    .from("employee_documents")
    .select("id, doc_type, file_name, uploaded_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Document not found, or not visible to you.");
  return ok(data);
};

const getPosition: ToolHandler = async (ctx, args) => {
  if (!["admin", "hr"].includes(ctx.role)) return fail("Position detail is visible to HR and admin roles only.");
  const id = String(args.position_id || "");
  if (!id) return fail("position_id is required.");
  const { data, error } = await ctx.supabase
    .from("positions")
    .select("id, title, position_code, lifecycle_status, status, headcount_approved, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Position not found.");
  return ok(data);
};

const getWorkforcePlan: ToolHandler = async (ctx, args) => {
  if (!["admin", "hr"].includes(ctx.role)) return fail("Workforce plans are visible to HR and admin roles only.");
  const id = String(args.plan_id || "");
  if (!id) return fail("plan_id is required.");
  const { data, error } = await ctx.supabase
    .from("workforce_plans")
    .select("id, name, status, planning_period_start, planning_period_end, workforce_plan_lines(id, planned_headcount, organisation_unit_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Workforce plan not found.");
  return ok(data);
};

const getCompensationSummary: ToolHandler = async (ctx, args) => {
  const employeeId = String(args.employee_id || "");
  if (!employeeId) return fail("employee_id is required.");
  const isSelf = ctx.employeeId === employeeId;
  if (!isSelf && !["admin", "hr"].includes(ctx.role)) {
    const { data: isManager } = await ctx.supabase.rpc("is_manager_of", { target_employee_id: employeeId });
    if (!isManager) return fail("You can only view your own compensation, or that of your direct reports.");
  }
  const { data: employee, error } = await ctx.supabase
    .from("employees")
    .select("id, name, basic, house_allowance, transport_allowance, other_allowance")
    .eq("id", employeeId)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!employee) return fail("Employee not found, or not visible to you.");
  const full = ["admin", "hr"].includes(ctx.role);
  if (full) {
    const { data: history } = await ctx.supabase
      .from("employee_compensation_history")
      .select("grade_id, effective_from")
      .eq("employee_id", employeeId)
      .is("effective_to", null)
      .maybeSingle();
    return ok({ ...employee, current_grade_id: history?.grade_id ?? null, effective_from: history?.effective_from ?? null });
  }
  // Manager/self: coarser view — no raw allowance breakdown, just the total.
  const total = Number(employee.basic) + Number(employee.house_allowance) + Number(employee.transport_allowance) + Number(employee.other_allowance);
  return ok({ id: employee.id, name: employee.name, total_monthly_compensation: total });
};

export const READ_TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_employee_profile: getEmployeeProfile,
  get_workforce_kpis: getWorkforceKpis,
  get_workforce_risks: getWorkforceRisks,
  search_hr_policy: searchHrPolicy,
  get_approval_status: getApprovalStatus,
  get_case_status: getCaseStatus,
  get_document_status: getDocumentStatus,
  get_position: getPosition,
  get_workforce_plan: getWorkforcePlan,
  get_compensation_summary: getCompensationSummary,
};

// ---------------------------------------------------------------------
// Action tool executors — only ever called post-confirmation, from
// confirm-action.ts. Each wraps the SAME server action the regular UI for
// that feature uses, so there is exactly one place that owns the business
// rule and authorization logic for each effect.
// ---------------------------------------------------------------------

export async function executeActionTool(ctx: ToolCallContext, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "start_workflow":
      case "create_hr_service_request": {
        // No generic, arbitrary-entity "start a workflow" exists safely
        // callable from chat (the five hard-wired priority workflows are
        // only ever triggered as a side effect of their own originating
        // action — onboarding of creating an employee, etc. — not
        // standalone from a free-text request). Both tools are
        // implemented as the same safe, generic intake: an HR service
        // request case, which HR triages and routes from there. This is a
        // disclosed scope narrowing from the spec's literal tool list.
        const { submitServiceRequest } = await import("@/lib/service-requests/actions");
        const fd = new FormData();
        const category = String(args.workflow_type ?? args.category ?? "general");
        const payload = (args.payload as Record<string, unknown> | undefined) ?? {};
        fd.set("subject", String(args.subject ?? `${category} (via AI Assistant)`));
        fd.set("description", String(args.description ?? JSON.stringify(payload)));
        fd.set("priority", "normal");
        await submitServiceRequest(fd);
        return ok({ submitted: true, category });
      }
      case "submit_position_request": {
        const { submitPositionRequest } = await import("@/lib/positions/position-request-actions");
        const fd = new FormData();
        fd.set("request_type", String(args.request_type));
        if (args.position_id) fd.set("position_id", String(args.position_id));
        const payload = (args.payload as Record<string, unknown> | undefined) ?? {};
        for (const [k, v] of Object.entries(payload)) fd.set(k, String(v));
        if (!payload.justification) fd.set("justification", "Submitted via AI Assistant.");
        await submitPositionRequest(fd);
        return ok({ submitted: true });
      }
      case "create_vacancy": {
        const { openVacancy } = await import("@/lib/positions/vacancy-actions");
        const fd = new FormData();
        fd.set("position_id", String(args.position_id));
        if (args.requisition_id) fd.set("requisition_id", String(args.requisition_id));
        if (args.notes) fd.set("notes", String(args.notes));
        await openVacancy(fd);
        return ok({ created: true });
      }
      case "submit_compensation_change": {
        const { submitCompensationChangeRequest } = await import("@/lib/compensation/change-request-actions");
        const fd = new FormData();
        fd.set("employee_id", String(args.employee_id));
        fd.set("effective_from", String(args.effective_from));
        fd.set("reason", String(args.reason));
        if (args.proposed_grade_id) fd.set("proposed_grade_id", String(args.proposed_grade_id));
        if (args.proposed_basic !== undefined) fd.set("proposed_basic", String(args.proposed_basic));
        await submitCompensationChangeRequest(fd);
        return ok({ submitted: true });
      }
      case "add_risk_comment": {
        const riskId = String(args.risk_event_id || "");
        if (!["admin", "hr"].includes(ctx.role)) return fail("Only HR/admin can comment on a workforce risk.");
        const { error } = await ctx.supabase.from("workforce_risk_comments").insert({
          risk_id: riskId,
          author_user_id: ctx.userId,
          body: String(args.comment || ""),
          visibility: "internal",
        });
        if (error) return fail(error.message);
        return ok({ commented: true });
      }
      case "assign_risk_action": {
        const riskId = String(args.risk_event_id || "");
        if (!["admin", "hr"].includes(ctx.role)) return fail("Only HR/admin can assign a workforce risk action.");
        const { error } = await ctx.supabase.from("workforce_risk_actions").insert({
          risk_id: riskId,
          title: args.action_note ? String(args.action_note) : "Remediation assigned via AI Assistant",
          assigned_to: String(args.assignee_user_id || ""),
          created_by: ctx.userId,
        });
        if (error) return fail(error.message);
        return ok({ assigned: true });
      }
      default:
        return fail(`Unknown action tool: ${toolName}`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Action failed.");
  }
}
