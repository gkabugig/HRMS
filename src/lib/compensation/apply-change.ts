// Area 17 §8.3: applying an approved/scheduled compensation change. Shared
// by the approvals-inbox decision handler (immediate effective_from) and
// the daily cron (scheduled effective_from arriving). Mirrors the existing
// close-prior-row + insert-new-row pattern in
// src/lib/employees/history.ts#recordCompensationHistoryChange, extended
// with grade/plan/change-request linkage — and also updates employees'
// own basic/allowance columns, since payroll (src/lib/payroll/calculate.ts,
// run-calculation.ts) reads those live columns directly, never the history
// table. Historical rows are never updated in place (§8.5 "Historical
// records are immutable") — only effective_to is closed out on the prior
// row; the new amounts always land in a new row.
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function applyCompensationChange(supabase: AnyClient, changeRequestId: string, actorUserId: string | null) {
  const { data: request } = await supabase
    .from("compensation_change_requests")
    .select("*")
    .eq("id", changeRequestId)
    .single();
  if (!request) throw new Error("Compensation change request not found.");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, basic, house_allowance, transport_allowance, other_allowance")
    .eq("id", request.employee_id)
    .single();
  if (!employee) throw new Error("Employee not found.");

  const newBasic = request.proposed_basic ?? employee.basic;
  const newHouse = request.proposed_house_allowance ?? employee.house_allowance;
  const newTransport = request.proposed_transport_allowance ?? employee.transport_allowance;
  const newOther = request.proposed_other_allowance ?? employee.other_allowance;

  // Close out whatever compensation-history row is still open, exactly as
  // the Employees-page edit flow does.
  await supabase
    .from("employee_compensation_history")
    .update({ effective_to: today() })
    .eq("employee_id", request.employee_id)
    .is("effective_to", null);

  await supabase.from("employee_compensation_history").insert({
    employee_id: request.employee_id,
    effective_from: request.effective_from,
    basic: newBasic,
    house_allowance: newHouse,
    transport_allowance: newTransport,
    other_allowance: newOther,
    reason: request.reason,
    approved_by: actorUserId,
    grade_id: request.proposed_grade_id,
    compensation_plan_id: null,
    change_request_id: changeRequestId,
  });

  // Live columns payroll actually reads — must move together with history,
  // or payroll keeps using the stale figures (see module header comment).
  await supabase
    .from("employees")
    .update({ basic: newBasic, house_allowance: newHouse, transport_allowance: newTransport, other_allowance: newOther })
    .eq("id", request.employee_id);

  await supabase
    .from("compensation_change_requests")
    .update({ status: "effective", applied_at: new Date().toISOString() })
    .eq("id", changeRequestId);

  await supabase.from("compensation_events").insert({
    org_id: request.org_id,
    entity_type: "compensation_change_request",
    entity_id: changeRequestId,
    event_type: "applied",
    actor_user_id: actorUserId,
    details: { employeeId: request.employee_id, basic: newBasic },
  });

  await recordAuditEvent(supabase, {
    orgId: request.org_id,
    actorUserId,
    action: "compensation_change_request.applied",
    resourceType: "employee",
    resourceId: request.employee_id,
    eventCategory: "data",
    riskLevel: "elevated",
    after: { basic: newBasic, houseAllowance: newHouse, transportAllowance: newTransport, otherAllowance: newOther },
  });

  if (request.review_item_id) {
    await supabase.from("compensation_review_items").update({ status: "approved" }).eq("id", request.review_item_id);
  }
}
