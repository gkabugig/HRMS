// Area 17 §8.5 "Budget validation before approval" — a simple, disclosed-
// scope check: sums the committed/pending annual cost increase for an
// organisation unit against any compensation_budgets row covering the
// change's effective date, and reports over/under. This is advisory
// (surfaced to the approver, not a hard DB-level block) — a full
// multi-dimensional budget engine (rollups across units, carry-forward,
// partial-year proration) is out of scope for this pass; the UI states
// this plainly wherever the check is shown.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export async function checkCompensationBudget(
  supabase: AnyClient,
  orgId: string,
  organisationUnitId: string | null,
  effectiveFrom: string,
  annualDeltaAmount: number
): Promise<{ hasBudget: boolean; budgetedAmount: number | null; committedAmount: number; withinBudget: boolean | null }> {
  if (!organisationUnitId) return { hasBudget: false, budgetedAmount: null, committedAmount: 0, withinBudget: null };

  const { data: budget } = await supabase
    .from("compensation_budgets")
    .select("budgeted_amount")
    .eq("org_id", orgId)
    .eq("organisation_unit_id", organisationUnitId)
    .lte("budget_period_start", effectiveFrom)
    .gte("budget_period_end", effectiveFrom)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!budget) return { hasBudget: false, budgetedAmount: null, committedAmount: annualDeltaAmount, withinBudget: null };

  // Committed = this change plus any other change_requests already
  // approved/scheduled/effective for employees currently assigned to the
  // same organisation unit this period — approximated via a simple sum
  // rather than a full ledger. Employees don't carry a direct unit column;
  // resolve current assignment via Area 04's own get_current_assignment_unit
  // RPC (the same authoritative source used elsewhere) rather than
  // inventing a parallel lookup.
  // Note: this loops one RPC call per org employee — fine at this
  // engagement's scale (tens to low hundreds of staff), but not something
  // to scale to a large org without batching.
  const { data: orgEmployees } = await supabase.from("employees").select("id").eq("org_id", orgId);
  const employeeIds: string[] = [];
  for (const e of orgEmployees ?? []) {
    const { data: unitId } = await supabase.rpc("get_current_assignment_unit", { p_employee_id: e.id, p_as_of: effectiveFrom });
    if (unitId === organisationUnitId) employeeIds.push(e.id);
  }

  let committed = annualDeltaAmount;
  if (employeeIds.length > 0) {
    const { data: priorChanges } = await supabase
      .from("compensation_change_requests")
      .select("proposed_basic, proposed_house_allowance, proposed_transport_allowance, proposed_other_allowance")
      .in("employee_id", employeeIds)
      .in("status", ["approved", "scheduled", "effective"])
      .gte("effective_from", effectiveFrom.slice(0, 4) + "-01-01");
    for (const c of priorChanges ?? []) {
      committed += (Number(c.proposed_basic) || 0) * 12;
    }
  }

  return {
    hasBudget: true,
    budgetedAmount: Number(budget.budgeted_amount),
    committedAmount: committed,
    withinBudget: committed <= Number(budget.budgeted_amount),
  };
}
